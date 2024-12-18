import env from 'env-var';

export const getStringOptional = (key: string) => env.get(key).asString() || undefined;
export const getString = (key: string) => env.get(key).required().asString();
export const getNumber = (key: string) => env.get(key).required().asInt();
export const getArray = (key: string) => env.get(key).required().asArray();

export const YNAB_API_KEY = getString('YNAB_API_KEY');
export const YNAB_BUDGET_NAME = getString('YNAB_BUDGET_NAME');

export const DB_CONNECTION_STRING = getString('DB_CONNECTION_STRING');
