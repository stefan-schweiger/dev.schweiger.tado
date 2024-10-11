import Homey from 'homey';
import { TadoClient } from '../../lib/TadoClient';

export class HeatPumpOptimizerDriver extends Homey.Driver {
  private _hotWaterTargetChangedTriggerCard: Homey.FlowCardTriggerDevice | undefined;

  get tadoClient(): TadoClient {
    return (this.homey.app as unknown as { tadoClient: TadoClient }).tadoClient;
  }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('HeatPumpOptimizerDriver has been initialized');

    const hotWaterActionCard = this.homey.flow.getActionCard('target_temperature.hot_water');
    hotWaterActionCard.registerRunListener(async (args, state) => {
      this.log('call client');
      await this.tadoClient.setHotWater(args.device.getData().id, args.temperature);
      this.log('set value');
      await args.device.setCapabilityValue('target_temperature.hot_water', args.temperature);
      this.log('trigger card');
      await this.triggerHotWaterTargetChanged(args.device, { target_temperature: args.temperature });
    });

    const heatingActionCard = this.homey.flow.getActionCard('target_temperature.heating');
    heatingActionCard.registerRunListener(async (args, state) => {
      await this.tadoClient.setHeating(args.device.getData().id, args.temperature);
      await args.device.setCapabilityValue('target_temperature.heating', args.temperature);
    });

    const heatingEcoActionCard = this.homey.flow.getActionCard('target_temperature.heating_eco');
    heatingEcoActionCard.registerRunListener(async (args, state) => {
      await this.tadoClient.setHeatingEco(args.device.getData().id, args.temperature);
      await args.device.setCapabilityValue('target_temperature.heating_eco', args.temperature);
    });

    const hotWaterModeActionCard = this.homey.flow.getActionCard('heat_pump_mode');
    hotWaterModeActionCard.registerRunListener(async (args, state) => {
      await this.tadoClient.setHotWaterScheduleMode(args.device.getData().id, args.mode === 'auto');
      await args.device.setCapabilityValue('heat_pump_mode', args.mode);
    });

    const hotWaterBoostActionCard = this.homey.flow.getActionCard('hot_water_boost');
    hotWaterBoostActionCard.registerRunListener(async (args, state) => {
      await this.tadoClient.boostHotWater(args.device.getData().id);
    });

    this._hotWaterTargetChangedTriggerCard = this.homey.flow.getDeviceTriggerCard('target_temperature_changed.hot_water');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    const devices = await this.tadoClient.getHeatPumps();

    return devices.map((device) => {
      return {
        name: device.name,
        data: {
          id: device.id,
        },
      };
    });
  }

  async triggerHotWaterTargetChanged(device: Homey.Device, tokens?: object, state?: object) {
    this.log('triggerHotWaterTargetChanged');
    await this._hotWaterTargetChangedTriggerCard?.trigger(device, tokens, state).catch(this.error);
  }
}

module.exports = HeatPumpOptimizerDriver;
