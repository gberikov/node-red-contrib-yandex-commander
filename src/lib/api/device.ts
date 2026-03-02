export interface DeviceConfig {
    allow_non_self_calls?: boolean;
    dndMode: {
        enabled: boolean;
        features: {
            allowIncomingCalls: boolean;
        };
    };
    equalizer?: {
        active_preset_id: string;
        bands: {
            freq: number;
            gain: number;
            width: number;
        }[];
        enabled: boolean;
        smartEnabled: boolean;
    };
    led: {
        time_visualization: {
            format: string;
        };
    };
    locale?: string;
    location?: {
        latitude: number;
        longitude: number;
    };
    name: string;
    timezone: {
        timezone_name: string;
    };
    voice_activation: {
        enabled: boolean;
    };
}

export interface DeviceGlagolSecurity {
    server_certificate: string;
    server_private_key: string;
}

export interface DeviceGlagol {
    security: DeviceGlagolSecurity;
}

export interface DeviceNetworkInfo {
    external_port: number;
    ip_addresses: string[];
    mac_addresses: string[];
    ts: number;
    wifi_ssid: string;
}

export interface Device {
    activation_code: number;
    activation_region: string;
    config: DeviceConfig;
    glagol: DeviceGlagol;
    id: string;
    name: string;
    networkInfo: DeviceNetworkInfo;
    platform: string;
    promocode_activated: boolean;
    tags: string[];
}

export interface DevicesResponse {
    devices: Device[];
    status: string;
}