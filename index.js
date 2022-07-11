/*
 * Copyright 2022 Jean-David Caprace <jd.caprace@gmail.com>
 *
 * Add the MIT license
 */

const ina219 = require('ina219-async');

module.exports = function (app) {
  let timer = null
  let plugin = {}

  plugin.id = 'signalk-raspberry-pi-light-characteristic'
  plugin.name = 'Raspberry-pi light characteristic'
  plugin.description = 'Experimental! SignalK node server plugin that check the state of the light characteristic using ina219 sensor.'

  plugin.schema = {
    type: 'object',
    properties: {
      skpath: {
        type: 'string',
        title: 'SignalK path to store the output.',
        description: 'This is used to build the path in Signal K for the state of the light characteristic to be analyzed.',
        default: 'environment.light.state'
		    //https://signalk.org/specification/1.5.0/doc/vesselsBranch.html
      },
      rate: {
        title: "Sample Rate (in minutes)",
        description: "Sample rate to send the status of the light characteristic to the server. Cannot be inferior to the cycletime.",
        type: 'number',
        default: 1
      },
      i2c_bus: {
        type: 'integer',
        title: 'I2C bus number',
        description: 'I2C bus number for the ina219 sensor.',
        default: 1,
      },
      i2c_address: {
        type: 'string',
        title: 'I2C address',
        description: 'I2C address for the ina219 sensor.',
        default: '0x40',
      },
      voltagemultiplier: {
        type: 'number',
        title: 'Voltage multiplier',
        decription: 'Parameter that is going to multiply the voltage (default: 1) to obtain the current from external current non invasive sensor.',
        default: 1,
      },
      currentrate: {
        title: 'Current sample rate',
        description: 'Current sample rate in milliseconds. Default: 100 milliseconds.',
        type: 'number',
        default: 100,
      },
      lowcurrent: {
        type: 'number',
        title: 'Low current value in amper',
        decription: 'This is the value of the current in amper that is measured in the circuit when the load (light) is off.',
        default: 0.3,
      },
      highcurrent: {
        type: 'number',
        title: 'High current calue in anper',
        decription: 'This is the value of the current in amper that is measured in the circuit when the load (light) is on.',
        default: 2,
      },
      errormargin: {
        type: 'number',
        title: 'Error margin in percent, example: 0.05 for 5%',
        decription: 'This is the error margin for the assessment of the light behaviour.',
        default: 0.05,
      },
      blinks: {
        type: "array",
        title: "Light characteristic pattern",
        description: 'Light pattern expressed with a sequence of pair [light on, light off] in seconds.',
        items: {
          type: "object",
          required: ['lon','loff'],
          properties: {
            lon: {
              type: 'number',
              title: 'Light on in seconds',
              default: 1.0,
            },
            loff: {
              type: 'number',
              title: 'Light off in seconds',
              default: 1.0,
            }
          }
        },
      },
    }
  }

  plugin.start = function (options) {

    function createDeltaMessage (lightstate) {
      var values = [
        {
          'path': options.skpath,
          'value': lightstate
        }
      ];
    
      return {
        'context': 'vessels.' + app.selfId,
        'updates': [
          {
            'source': {
              'label': plugin.id
            },
            'timestamp': (new Date()).toISOString(),
            'values': values
          }
        ]
      }
    }

	  // Read ina219 sensor.
    // Here we only use the bus voltage reading because an external non invasive sensor is used.
    // To obtain the value of the current we will multiply the voltage value with a voltage multiplier.
    async function readina219() {
		  const sensor = await ina219(Number(options.i2c_address), options.i2c_bus);
      await sensor.calibrate32V2A();

		  const busvoltage = await sensor.getBusVoltage_V();
      console.log("Bus voltage (V): " + busvoltage);
      const shuntvoltage = await sensor.getShuntVoltage_mV();
      //console.log("Shunt voltage (mV): " + shuntvoltage);
      const shuntcurrent = await sensor.getCurrent_mA();
      //console.log("Shunt Current (mA): " + shuntcurrent);

      // Change units to be compatible with SignalK
	    var shuntcurrentA = shuntcurrent / 1000;
	    //console.log("Load Current (A): " + shuntcurrentA);
	    var loadvoltageV = busvoltage + (shuntvoltage / 1000);
	    //console.log("Load voltage (V): " + loadvoltageV);

      //.catch((err) => {
      //console.log(`ina219 read error: ${err}`);
      //});
      return busvoltage;
    }

    function cycletime(){
      var cycletime = 0.0;
      if (options.blinks && options.blinks.length > 0){
        options.blinks.forEach(blink => {
          //app.debug(param);
          if (typeof(blink.lon) == "number" && typeof(blink.loff) == "number"){
            cycletime = cycletime + blink.lon + blink.loff;
          }
        })
      }
      return cycletime;
    }

    function ontime(){
      var ontime = 0.0;
      if (options.blinks && options.blinks.length > 0){
        options.blinks.forEach(blink => {
          //app.debug(param);
          if (typeof(blink.lon) == "number" && typeof(blink.loff) == "number"){
            ontime = ontime + blink.lon;
          }
        })
      }
      console.log("ontime: " + ontime);
      return ontime;
    }

    function offtime(){
      var offtime = 0.0;
      if (options.blinks && options.blinks.length > 0){
        options.blinks.forEach(blink => {
          //app.debug(param);
          if (typeof(blink.lon) == "number" && typeof(blink.loff) == "number"){
            offtime = offtime + blink.loff;
          }
        })
      }
      console.log("offtime: " + offtime);
      return offtime;
    }

    //Check if the light is on or off depending of the current threshold
    function checklightstate(){
      var lightstate = 0;
      var busvoltage = readina219();
      var buscurrent = busvoltage * options.voltagemultiplier;
      //console.log("Buscurrent: " + buscurrent);

      //defining the threshold
      var threshold = options.lowcurrent + ((options.highcurrent - options.lowcurrent) / 2);
      //console.log("Threshold: " + threshold);

      if(buscurrent >= threshold){
        lightstate = 1;//if on = 1
      } else {
        lightstate = 0;//if off = 0
      }
      //console.log("lightstate: " + lightstate);
      return lightstate;
    }

    //TODO check day-night to send wanring during night only!

    var timeson = 0;
    var timesoff = 0;
    var lightratio = 0;
    var reflightratio = ontime/offtime;
    var lighthealth = 0; //0 = healthy, 1 = not healthy;
    function countingcycletime(){
      if(checklightstate == 1){timeson = timeson + 1};
      if(checklightstate == 0){timesoff = timesoff + 1};
    }

    // repeat with the interval of x millisseconds
    let timerId = setInterval(() => {countingcycletime();}, options.currentrate);

    // after x seconds stop, do the business and run again.
    setTimeout(() => {
      clearInterval(timerId);//stop
      console.log("timeson: " + timeson);
      console.log("timesoff: " + timesoff);
      lightratio =  timeson / timesoff;
      console.log("reflightratio: " + reflightratio);
      console.log("lightratio: " + lightratio);

      //Verifying if the measurement is inside the margin of tolerance
      var lowref = reflightratio - (options.errormargin * reflightratio)
      var highref = reflightratio + (options.errormargin * reflightratio)
      console.log("lowref: " + lowref);
      console.log("highref: " + highref);
      if(lightratio >= lowref && lightratio <= highref){
        lighthealth = 0;//Healthy
      } else {
        lighthealth = 1;//Not healthy
      }
      console.log("OUTPUT - lighthealth: " + lighthealth);
      timeson = 0; //reinitialized counters and variables
      timesoff = 0;
      lightratio = 0;
      timerId = setInterval(() => {countingcycletime();}, options.currentrate);//run again
    }, cycletime * 1000);//check during one full cycletime


    function sendlighthealth(status){
      //To check the light state
      var thelighthealth = status;
      // create message
      var delta = createDeltaMessage(thelighthealth);
      // send data
      app.handleMessage(plugin.id, delta);
    }
        
    timer = setInterval(sendlighthealth(lighthealth), options.rate * 60 * 1000);
  }

  plugin.stop = function () {
    if(timer){
      clearInterval(timer);
      timeout = null;
    }
  }

  return plugin
}


