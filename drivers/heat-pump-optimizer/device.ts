import Homey from 'homey';
import { TadoClient } from '../../lib/TadoClient';
import { HeatPumpOptimizerDriver } from './driver';

class HeatPumpOptimizerDevice extends Homey.Device {
  get tadoClient(): TadoClient {
    return (this.homey.app as unknown as { tadoClient: TadoClient }).tadoClient;
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.registerCapabilityListener('target_temperature.heating', async (value) => {
      await this.tadoClient.setHeating(this.getData().id, value);
    });

    this.registerCapabilityListener('target_temperature.heating_eco', async (value) => {
      await this.tadoClient.setHeatingEco(this.getData().id, value);
    });

    this.registerCapabilityListener('target_temperature.hot_water', async (value) => {
      this.log('device: trigger card');
      await (this.driver as HeatPumpOptimizerDriver).triggerHotWaterTargetChanged(this, { target_temperature: value });
      this.log('device: call client');
      await this.tadoClient.setHotWater(this.getData().id, value);
      this.log('device: done');
    });

    this.registerCapabilityListener('heat_pump_mode', async (value) => {
      await this.tadoClient.setHotWaterScheduleMode(this.getData().id, value === 'auto');
    });

    this.updateHotWaterValues();
    this.updateHeatingValues();

    this.homey.setInterval(() => {
      this.updateHotWaterValues();
    }, 60 * 1000);

    this.homey.setInterval(
      () => {
        this.updateHeatingValues();
      },
      5 * 60 * 1000,
    );

    this.log('Heat Pump Optimizer has been initialized');
  }

  async updateHeatingValues() {
    try {
      const heatingSchedule = await this.tadoClient.getHeatingSchedule(this.getData().id);
      this.setCapabilityValue('target_temperature.heating', Number(heatingSchedule?.targetSetpointValue.value));
      this.setCapabilityValue('target_temperature.heating_eco', Number(heatingSchedule?.fallbackSetpointValue.value));
    } catch (error) {
      this.error(error);
      await this.setUnavailable('Could not load current values');
    }
  }

  async updateHotWaterValues() {
    try {
      const heatSource = await this.tadoClient.getHeatSource(this.getData().id);
      const hotWaterSchedule = await this.tadoClient.getHotWaterSchedule(this.getData().id);

      const newHotWaterTarget = Number(hotWaterSchedule?.targetSetpointValue.value);

      if (newHotWaterTarget !== this.getCapabilityValue('target_temperature.hot_water')) {
        this.log('value changed');
        await (this.driver as HeatPumpOptimizerDriver).triggerHotWaterTargetChanged(this, { target_temperature: newHotWaterTarget });
      }

      this.setCapabilityValue('target_temperature.hot_water', Number(hotWaterSchedule?.targetSetpointValue.value));
      this.setCapabilityValue('measure_temperature.hot_water', Number(heatSource?.domesticHotWater.currentTemperatureInCelsius));
      this.setCapabilityValue('heat_pump_mode', heatSource?.domesticHotWater.manualOffActive ? 'off' : 'auto');

      if (heatSource?.connection.state === 'CONNECTED' && heatSource?.domesticHotWater.available && heatSource?.heating.available) {
        await this.setAvailable();
      } else {
        await this.setUnavailable('Heat pump is not available');
      }
    } catch (error) {
      this.error(error);
      await this.setUnavailable('Could not load current values');
    }
  }
}

module.exports = HeatPumpOptimizerDevice;
