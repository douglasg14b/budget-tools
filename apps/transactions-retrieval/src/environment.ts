import env from 'env-var';

export const getStringOptional = (key: string) => env.get(key).asString() || undefined;
export const getString = (key: string) => env.get(key).required().asString();
export const getNumber = (key: string) => env.get(key).required().asInt();
export const getArray = (key: string) => env.get(key).required().asArray();

export const YNAB_API_KEY = getString('YNAB_API_KEY');
export const YNAB_BUDGET_NAME = getString('YNAB_BUDGET_NAME');

export const DB_USER = getString('DB_USER');
export const DB_PASSWORD = getString('DB_PASSWORD');
export const DB_NAME = getString('DB_NAME');
export const DB_HOST = getString('DB_HOST');
export const DB_PORT = getNumber('DB_PORT');
