const BD_MOBILE_REGEX = /^01[3-9][0-9]{8}$/;

export interface ConfigDefinition {
  path: string;
  value: string | undefined | null;
}

export class CourierDataValidator {
  static enforceEnv(variables: string[]): void {
    for (const v of variables) {
      if (!process.env[v]) {
        throw new Error(
          `The environment variable ${v} is required but missing.`,
        );
      }
    }
  }

  static checkBdMobile(mobileNumber: string): void {
    if (!mobileNumber || !BD_MOBILE_REGEX.test(String(mobileNumber))) {
      throw new Error(
        "The provided phone number is invalid. Please format it locally (e.g., 01*********) without +88.",
      );
    }
  }

  static enforceConfig(definitions: ConfigDefinition[]): void {
    for (const { path, value } of definitions) {
      if (value === undefined || value === null || value === "") {
        throw new Error(`The config key ${path} is required but missing.`);
      }
    }
  }
}

export default CourierDataValidator;
