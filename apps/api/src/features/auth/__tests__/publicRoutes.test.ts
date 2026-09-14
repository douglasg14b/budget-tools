import { describe, expect, it } from 'vitest';

import { isPublicPath, normalisePath, requiresAuthentication } from '../publicRoutes';

describe('normalisePath', () => {
    it('strips the /api base path', () => {
        expect(normalisePath('/api/health')).toBe('/health');
        expect(normalisePath('/health')).toBe('/health');
    });

    it('strips query strings and trailing slashes', () => {
        expect(normalisePath('/api/health?deep=true')).toBe('/health');
        expect(normalisePath('/api/health/')).toBe('/health');
        expect(normalisePath('/api/health///')).toBe('/health');
    });

    it('lowercases so casing cannot change the decision', () => {
        expect(normalisePath('/API/Health')).toBe('/health');
    });

    it('does not strip /api from a path that merely starts with those letters', () => {
        expect(normalisePath('/apikeys')).toBe('/apikeys');
    });
});

describe('isPublicPath', () => {
    it('allows health and the login/logout endpoints', () => {
        expect(isPublicPath('/api/health')).toBe(true);
        expect(isPublicPath('/api/auth/login')).toBe(true);
        expect(isPublicPath('/api/auth/logout')).toBe(true);
    });

    it('protects /auth/me so the web app can use its 401 as the signed-out signal', () => {
        expect(isPublicPath('/api/auth/me')).toBe(false);
    });

    it.each([
        '/api/receipts',
        '/api/receipts/abc-123',
        '/api/accounts',
        '/api/categorization/queue',
        '/api/travel-windows',
        '/api/operating-mode',
        '/api/amazon-orders/status',
        '/api/periodic-series',
        '/api/categories',
        '/api/travel-bias',
    ])('protects %s', (path) => {
        expect(isPublicPath(path)).toBe(false);
    });

    it('is not fooled by casing or trailing slashes', () => {
        expect(isPublicPath('/api/AUTH/LOGIN')).toBe(true);
        expect(isPublicPath('/api/receipts/')).toBe(false);
    });

    it('does not treat a path merely prefixed with a public route as public', () => {
        expect(isPublicPath('/api/health-secrets')).toBe(false);
        expect(isPublicPath('/api/auth/login-as-admin')).toBe(false);
    });
});

describe('requiresAuthentication', () => {
    it('lets CORS preflight through without a session', () => {
        expect(requiresAuthentication('OPTIONS', '/api/receipts')).toBe(false);
        expect(requiresAuthentication('options', '/api/receipts')).toBe(false);
    });

    it('requires a session for ordinary verbs on protected routes', () => {
        for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
            expect(requiresAuthentication(method, '/api/receipts')).toBe(true);
        }
    });

    it('never requires a session on public routes', () => {
        expect(requiresAuthentication('POST', '/api/auth/login')).toBe(false);
        expect(requiresAuthentication('GET', '/api/health')).toBe(false);
    });
});
