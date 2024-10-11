'use strict';

// This is a helper for the settings page to handle potential connection errors correctly
export const connect = async ({ homey }: any) => {
  await homey.app.connect();
}
