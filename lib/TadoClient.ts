import { SimpleClass } from 'homey';
import { AccessToken, ResourceOwnerPassword } from 'simple-oauth2';

const LEGACY_API_URL = 'https://my.tado.com/api/v2';
const API_URL = 'https://hops.tado.com';
const OAUTH_CONFIG = {
  client: {
    id: 'tado-web-app',
    secret: 'wZaRN7rpjn3FoNyF5IFuxg9uMzYJcvOoQ8QWiIqS3hfk6gLhVlG57j5YNoZL2Rtc',
  },
  auth: {
    tokenHost: 'https://auth.tado.com',
  },
};
const OAUTH_SCOPE = 'home.user';

const parseToken = (token: string) => {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
};

type SetpointValue = {
  value: number | string;
  valueType: 'TEMPERATURE_C' | string;
};

type Schedule = {
  fallbackSetpointValue: SetpointValue;
  targetSetpointValue: SetpointValue;
  scheduleType: 'MANUAL' | string;
  monday: unknown[];
  tuesday: unknown[];
  wednesday: unknown[];
  thursday: unknown[];
  friday: unknown[];
  saturday: unknown[];
  sunday: unknown[];
};

type HeatSource = {
  connection: {
    state: 'CONNECTED' | string;
  };
  domesticHotWater: {
    available: boolean;
    manualOffActive: boolean;
    currentTemperatureInCelsius: number;
    tankIsFullyLoaded: boolean;
  };
  heating: {
    available: boolean;
  };
};

export class TadoClient extends SimpleClass {
  private _client = new ResourceOwnerPassword(OAUTH_CONFIG);
  private _token?: AccessToken;

  constructor(
    private readonly _user: string,
    private readonly _password: string,
  ) {
    super();
  }

  public async connect() {
    const token = await this.getToken();

    if (!token) {
      throw new Error('Could not authenticate with Tado');
    }
  }

  private async getToken() {
    try {
      if (this._token?.expired()) {
        this._token = await this._token.refresh();
      } else {
        this._token = await this._client.getToken({
          username: this._user,
          password: this._password,
          scope: OAUTH_SCOPE,
        });
      }
    } catch (error) {
      this._token = undefined;
      if (error instanceof Error) {
        this.error('Access Token Error', error.message);
      }
    }

    return this._token?.token.access_token as string | undefined;
  }

  private async makeRequest<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
    const token = await this.getToken();
    if (!token) {
      throw new Error('No token available');
    }

    const response = await fetch(path, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (!response.ok) {
      if (response.headers.get('content-type')?.includes('application/json')) {
        const responseContent: any = await response.json();
        const errorTitle = responseContent?.errors?.[0]?.title;

        throw new Error(errorTitle ?? `Request failed with status ${response.status}`);
      } else {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    if (response.status === 204) {
      return undefined;
    }

    return response.json() as T;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
    return this.makeRequest<T>(`${API_URL}${path}`, options);
  }

  private async legacyRequest<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
    return this.makeRequest<T>(`${LEGACY_API_URL}${path}`, options);
  }

  public async getHeatPumps() {
    const token = await this.getToken();

    if (!token) {
      throw new Error('No token available');
    }

    const tokenInfo = parseToken(token);
    const homeIds = tokenInfo.tado_homes.map((h: any) => h.id) as string[];

    const heatPumps = [];

    for (const homeId of homeIds) {
      const home = await this.request<{ isHeatPumpInstalled: boolean }>(`/homes/${homeId}`, {
        method: 'GET',
      });

      if (home?.isHeatPumpInstalled) {
        const legacyHome = await this.legacyRequest<{ id: string; name: string }>(`/homes/${homeId}`);

        legacyHome &&
          heatPumps.push({
            id: legacyHome.id,
            name: legacyHome.name,
          });
      }
    }

    return heatPumps;
  }

  public async getHotWaterSchedule(homeId: string) {
    return this.request<{ schedule: Schedule }>(`/homes/${homeId}/heatPump/domesticHotWater`).then((res) => res?.schedule);
  }

  public async getHeatingSchedule(homeId: string) {
    return this.request<{ schedule: Schedule }>(`/homes/${homeId}/heatPump/heating`).then((res) => res?.schedule);
  }

  public async getHeatSource(homeId: string) {
    return this.request<HeatSource>(`/homes/${homeId}/heatPump`);
  }

  public async setHeating(homeId: string, target: number) {
    const schedule = await this.getHeatingSchedule(homeId);

    if (!schedule) {
      throw new Error('Could not get current heating schedule');
    }

    schedule.targetSetpointValue.value = target.toString();

    return this.request(`/homes/${homeId}/heatPump/heating/schedule`, {
      method: 'PUT',
      body: JSON.stringify(schedule),
    });
  }

  public async setHeatingEco(homeId: string, target: number) {
    const schedule = await this.getHeatingSchedule(homeId);

    if (!schedule) {
      throw new Error('Could not get current heating schedule');
    }

    schedule.fallbackSetpointValue.value = target.toString();

    return this.request(`/homes/${homeId}/heatPump/heating/schedule`, {
      method: 'PUT',
      body: JSON.stringify(schedule),
    });
  }

  public async setHotWater(homeId: string, target: number) {
    const schedule = await this.getHotWaterSchedule(homeId);

    if (!schedule) {
      throw new Error('Could not get current heating schedule');
    }

    schedule.targetSetpointValue.value = target.toString();

    await this.request(`/homes/${homeId}/heatPump/domesticHotWater/schedule`, {
      method: 'PUT',
      body: JSON.stringify(schedule),
    });
  }

  public async setHotWaterScheduleMode(homeId: string, schedule: boolean) {
    if (schedule) {
      await this.request(`/homes/${homeId}/heatPump/domesticHotWater/off`, {
        method: 'DELETE',
      });
    } else {
      await this.request(`/homes/${homeId}/heatPump/domesticHotWater/off`, {
        method: 'POST',
        body: '{}',
      });
    }
  }

  public async boostHotWater(homeId: string) {
    return this.request(`/homes/${homeId}/heatPump/domesticHotWater/boost`, {
      method: 'POST',
    });
  }
}
