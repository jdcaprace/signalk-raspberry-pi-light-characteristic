
# signalk-raspberry-pi-light-characteristic
This is EXPERIMENTAL! Only to be use by experts.

SignalK node server plugin that check the state of the light characteristic using ina219 sensor connected to an indirect current sensor.

This plugin can be downloaded via the SignalK application.

## Getting Started
You will need a raspberry pi with SignalK installed along with a ina219 sensor.

### The ina219 sensor
Personally I am using the sensor found at the following link on Amazon. However there are many manufacturers to pick from.
HiLetgo ina219 current shunt and power monitor sensor for Raspberry Pi with I2C build by Texas Instruments.

![ina219](../master/Pictures/adafruit_ina219.png)

Learn more: https://www.amazon.com/HiLetgo-INA219-Bi-directional-Current-Breakout/dp/B01ICN5OAM/

The datasheet of the ina219 can be found here: https://www.ti.com/lit/ds/symlink/ina219.pdf

### Connecting the Sensor
All you need to start is connecting the 4 pins (3.3V Power - VCC), (I2C - SDA), (I2C - SCL) and (Ground - GND) to your Raspberry Pi.

The GPIO of the raspberry Pi is detailed here: https://docs.microsoft.com/pt-br/windows/iot-core/learn-about-hardware/pinmappings/pinmappingsrpi

You need to make sure Raspberry Pi is turned off while doing this!

In order to use the sensor, the i2c bus must be enabled on your rasbperry pi. This can be accomplished using "sudo raspi-config".

### Using an indirect current sensor
In order to apply this solution you can use this plugin buying one non invasive current sensor depending of your needs (hall open loop current sensor).

The sugestion is to find sensors that has supply voltage of +5V and a rated output of 2.5+-0.625V with a frequency range of DC to 25KHz. In that way you can measure the current by measuring a voltage. We suggest the use of the YHDC sensors.

### Plugin configuration
The following parameters can be configured in the plugin:
* The SignalK path to store the output. Note that 0 means that the light is healthy and 1 means that the light failed.
* The sample Rate (in minutes) to send the data to the signalK server. It should be inferior to the cycle time (full cyle of the light characteristics) to be consistent.
* The I2C bus number for the ina219 sensor. Note: Only the voltage measurement is used here.
* The I2C address for the ina219 sensor.
* The parameter that is going to multiply the voltage (default: 1) to obtain the current from external current non invasive sensor.
* The current sample rate in milliseconds. Default: 100 milliseconds.
* The value of the current in amper that is measured in the circuit when the load (light) is off.
* The value of the current in amper that is measured in the circuit when the load (light) is on.
* Error margin in percent, example: 0.05 for 5%.
* The light characteristic pattern. Light pattern expressed with a sequence of pair [light on, light off] in seconds.

## Troubleshooting
When you first start SK, you should see one of two things in the /var/log/syslog; ina219 initialization succeeded or ina219 initialization failed along with details of the failure.

If the sensor isn't found you can run `ls /dev/*i2c*` which should return `/dev/i2c-1`. If it doesnt return then make sure that the i2c bus is enabled using raspi-config.

You can also download the i2c-tools by running `sudo apt-get install -y i2c-tools`. Once those are installed you can run `i2cdetect -y 1`. You should see the ina219 detected as address 0x77. If the sensor isn't detected then go back and check the sensor wiring.

## Authors
* **Jean-David Caprace** - *Author of this plugin*
