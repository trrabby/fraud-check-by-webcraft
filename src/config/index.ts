import dotenv from "dotenv";
import path from "path";
dotenv.config();

dotenv.config({ path: path.join(process.cwd(), ".env") });

export interface CourierCredentials {
  user?: string;
  password?: string;
  phone?: string;
}

export interface AppConfig {
  port: number;
  couriers: {
    steadfast: Required<Pick<CourierCredentials, "user" | "password">>;
    pathao: Required<Pick<CourierCredentials, "user" | "password">>;
    redx: Required<Pick<CourierCredentials, "phone" | "password">>;
    paperfly: Required<Pick<CourierCredentials, "user" | "password">>;
    carrybee: Required<Pick<CourierCredentials, "phone" | "password">>;
  };
}

const config: AppConfig = {
  port: Number.parseInt(process.env.PORT ?? "5300", 10) || 5300,
  couriers: {
    steadfast: {
      user: process.env.STEADFAST_USER ?? "",
      password: process.env.STEADFAST_PASSWORD ?? "",
    },
    pathao: {
      user: process.env.PATHAO_USER ?? "",
      password: process.env.PATHAO_PASSWORD ?? "",
    },
    redx: {
      phone: process.env.REDX_PHONE ?? "",
      password: process.env.REDX_PASSWORD ?? "",
    },
    paperfly: {
      user: process.env.PAPERFLY_USER ?? "",
      password: process.env.PAPERFLY_PASSWORD ?? "",
    },
    carrybee: {
      phone: process.env.CARRYBEE_PHONE ?? "",
      password: process.env.CARRYBEE_PASSWORD ?? "",
    },
  },
};

export default config;
