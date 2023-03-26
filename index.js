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
        default: 1.0,
      },
      voltageoffset: {
        type: 'number',
        title: 'Voltage offset',
        decription: 'Parameter that is going to offset the voltage (default: 0) to obtain the current from external current non invasive sensor.',
        default: 0.0,
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
        description: 'This is the value of the current in amper that is measured in the circuit when the load (light) is off.',
        default: 0.3,
      },
      highcurrent: {
        type: 'number',
        title: 'High current value in amper',
        description: 'This is the value of the current in amper that is measured in the circuit when the load (light) is on.',
        default: 2,
      },
      errormargin: {
        type: 'number',
        title: 'Error margin in percent, example: 0.05 for 5%',
        description: 'This is the error margin for the assessment of the light behaviour.',
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
    //var busvoltage = 0.0;
    async function readina219() {
		  const sensor = await ina219(Number(options.i2c_address), options.i2c_bus);
      await sensor.calibrate32V2A();

		  var busvoltage = await sensor.getBusVoltage_V();
      app.debug("Bus voltage (V): " + busvoltage);
      const shuntvoltage = await sensor.getShuntVoltage_mV();
      //app.debug("Shunt voltage (mV): " + shuntvoltage);
      const shuntcurrent = await sensor.getCurrent_mA();
      //app.debug("Shunt Current (mA): " + shuntcurrent);

      // Change units to be compatible with SignalK
	    var shuntcurrentA = shuntcurrent / 1000;
	    //app.debug("Load Current (A): " + shuntcurrentA);
	    var loadvoltageV = busvoltage + (shuntvoltage / 1000);
	    //app.debug("Load voltage (V): " + loadvoltageV);
      
      //app.catch((err) => {
      //app.debug(`ina219 read error: ${err}`);
      //});
      return busvoltage;
    }

    function cycletime(){
      var cycletime = 0.0;
      if (options.blinks && options.blinks.length > 0){
        options.blinks.forEach(blink => {
          app.debug(blink);
          if (typeof(blink.lon) == "number" && typeof(blink.loff) == "number"){
            cycletime = cycletime + blink.lon + blink.loff;
          }
        })
      }
      app.debug("cycletime: " + cycletime);
      return cycletime;
    }

    function ontime(){
      var ontime = 0.0;
      if (options.blinks && options.blinks.length > 0){
        options.blinks.forEach(blink => {
          //app.debug(blink);
          if (typeof(blink.lon) == "number" && typeof(blink.loff) == "number"){
            ontime = ontime + blink.lon;
          }
        })
      }
      app.debug("ontime: " + ontime);
      return ontime;
    }

    function offtime(){
      var offtime = 0.0;
      if (options.blinks && options.blinks.length > 0){
        options.blinks.forEach(blink => {
          //app.debug(blink);
          if (typeof(blink.lon) == "number" && typeof(blink.loff) == "number"){
            offtime = offtime + blink.loff;
          }
        })
      }
      app.debug("offtime: " + offtime);
      return offtime;
    }

    //Check if the light is on or off depending of the current threshold
    async function checklightstate(){
      
      var lightstate = 0;
      var promisevoltage = readina219();
      
      var thepromisevoltage = promisevoltage.then((value) => {
        //app.debug('0: Interpret voltage premise: ' + value);
        var busvoltage = value;   

        app.debug("The bus voltage is: " + busvoltage);
        var buscurrent = (parseFloat(busvoltage) + parseFloat(options.voltageoffset)) * parseFloat(options.voltagemultiplier);
        app.debug("The bus current is: " + buscurrent);

        //defining the threshold
        var threshold = options.lowcurrent + ((options.highcurrent - options.lowcurrent) / 2);
        //app.debug("Threshold: " + threshold);

        if(buscurrent >= threshold){
          lightstate = 1;//if on = 1
        } else {
          lightstate = 0;//if off = 0
        }

        //app.debug("1: lightstate inside await: " + lightstate);
      });
      await thepromisevoltage;
      
      //app.debug("2: lightstate outside await: " + lightstate);
      return lightstate;
    }

    //TODO check day-night to send warning during night only!

    var timeson = 0;
    var timesoff = 0;
    var lightratio = 0;
    var vontime = ontime();
    var vofftime = offtime();
    var vcycletime = cycletime();
    var reflightratio = vontime / vofftime;
    var lighthealth = 0; //0 = healthy, 1 = not healthy;
    var i = 0;
    var j = 0;

    function timestamp(){
      var today = new Date();
      var DD = String(today.getDate()).padStart(2, '0');
      var MM = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
      var YYYY = today.getFullYear();
      var hh = today.getHours();
      var mm = today.getMinutes();
      var ss = today.getSeconds();
      today = YYYY + MM + DD + hh + mm + ss;
      return today;
    }

    async function countingcycletime(){
      i = i + 1;
      var lightstate = 0;
      //app.debug(timestamp() + "- entering in countingcycletime cptr: " + i);
      var state = checklightstate();

      var thestate = state.then((value) => {
        var thelightstate = value;
        lightstate = thelightstate;
        //app.debug('1: Resolving the checklite state: ' + lightstate);
      }); 
      
      await thestate;
      //app.debug('2: Resolving the checklite state: ' + lightstate);

      if(lightstate == 1){
        timeson = timeson + 1;
        //app.debug("timeson: " + timeson);
      }
      if(lightstate == 0){
        timesoff = timesoff + 1;
        //app.debug("timesoff: " + timesoff);
      }
    }

    //This is the global loop to repeat the measurement cycle.
    function mainrepeatmeasuring(){
      app.debug(timestamp() + "- entering in main.");

      // repeat with the interval of x millisseconds
      var timerId = setInterval(() => {countingcycletime();}, options.currentrate);

      //stop the measuring cycle and do the business
      stopmeasuring(timerId);

      //sending the result to signalK
      sendlighthealth(lighthealth);
      
      var waitingtimebetweencycles = (vcycletime * 1000)/3;
      setTimeout(mainrepeatmeasuring, waitingtimebetweencycles);//wait 1/3 of the cycle time and start again.
    }

    function stopmeasuring(timerId){
    // after x seconds stop and do the business.
      setTimeout(() => {
        clearInterval(timerId);//stop
        app.debug(timestamp() + "- stopping measurement. RESULTS:");
        j = j + 1;
        //app.debug("j: " + j);
        app.debug("timeson: " + timeson);
        app.debug("timesoff: " + timesoff);
        lightratio =  timeson / timesoff;
        app.debug("reflightratio: " + reflightratio);
        app.debug("lightratio: " + lightratio);
        
        //Verifying if the measurement is inside the margin of tolerance
        var lowref = reflightratio - (options.errormargin * reflightratio)
        var highref = reflightratio + (options.errormargin * reflightratio)
        app.debug("lowref: " + lowref);
        app.debug("highref: " + highref);
        if(lightratio >= lowref && lightratio <= highref){
          lighthealth = 0;//Healthy
        } else {
          lighthealth = 1;//Not healthy
        }
        app.debug("OUTPUT - lighthealth: " + lighthealth);
        app.debug("****************************************");
        timeson = 0; //reinitialized counters and variables
        timesoff = 0;
        lightratio = 0;
        i = 0;
      }, (vcycletime * 1000));//check during one full cycletime
    }

    function sendlighthealth(status){
      //To check the light state
      var thelighthealth = status;
      // create message
      var delta = createDeltaMessage(thelighthealth);
      // send data
      app.handleMessage(plugin.id, delta);
    }
    
    mainrepeatmeasuring();
  }

  plugin.stop = function () {
    if(timer){
      clearInterval(timer);
      timeout = null;
    }
  }

  return plugin
}


