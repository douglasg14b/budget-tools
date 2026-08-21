import env from 'env-var';

export const API_PORT = env.get('API_PORT').default('4020').asPortNumber();
