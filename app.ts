'use strict';

import Homey from 'homey';
import { TadoClient } from './lib/TadoClient';

const SETTING_USERNAME = 'username';
const SETTING_PASSWORD = 'password';

class MyApp extends Homey.App {
  public tadoClient?: TadoClient;

  private getSetting = (key: string): any => this.homey.settings.get(key);
  private setSetting = (key: string, value: any): void => this.homey.settings.set(key, value);

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    if (this.getSetting(SETTING_USERNAME) && this.getSetting(SETTING_PASSWORD)) {
      try {
        await this.connect();
      } catch (e) {
        this.error('Connection during onInit failed');
      }
    }
  }

  async connect() {
    const username = this.getSetting(SETTING_USERNAME);
    const password = this.getSetting(SETTING_PASSWORD);

    if (!username || !password) {
      this.error('Username or password not set');
      return;
    }

    try {
      this.tadoClient = new TadoClient(username, password);
      this.tadoClient.connect();
      this.log('Connected to Tado');
    } catch (e) {
      this.tadoClient = undefined;
      throw new Error('Not able to connect to Tado');
    }
  }
}

module.exports = MyApp;
