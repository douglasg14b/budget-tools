import { getBackendErrorMessage } from '../components/BackendErrorNotice';

/**
 * Shown when the server rejected the credentials but gave us nothing readable to display.
 * Deliberately vague about which half was wrong — naming the username confirms account
 * existence to anyone probing the form.
 */
const INVALID_CREDENTIALS_MESSAGE = 'Incorrect username or password.';

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

const FALLBACK_MESSAGE = 'Sign-in failed. Please try again.';

function statusOf(error: unknown): number | null {
    if (!error || typeof error !== 'object') {
        return null;
    }
    const { status } = error as { status?: unknown };
    return typeof status === 'number' ? status : null;
}

/**
 * A fetch that never reached the server rejects with a TypeError and no status, which
 * `getBackendErrorMessage` would surface as the browser's raw "Failed to fetch". That is
 * noise to a person trying to sign in, so it gets its own plain-language message.
 */
function isNetworkFailure(error: unknown): boolean {
    return error instanceof TypeError && statusOf(error) === null;
}

/**
 * Maps whatever the login mutation rejected with onto a sentence worth showing a user.
 *
 * The SDK throws the parsed error body on a non-2xx, so a 401 usually carries the API's own
 * `{ message }`. We prefer that text when it exists and fall back to fixed copy per status so
 * the form never renders an empty alert or a stringified object.
 */
export function loginErrorMessage(error: unknown): string {
    if (!error) {
        return FALLBACK_MESSAGE;
    }
    if (isNetworkFailure(error)) {
        return OFFLINE_MESSAGE;
    }

    const status = statusOf(error);
    const defaultForStatus = status === 401 ? INVALID_CREDENTIALS_MESSAGE : FALLBACK_MESSAGE;
    const serverMessage = getBackendErrorMessage(error, '');

    if (!serverMessage) {
        return defaultForStatus;
    }
    // A bare "Unauthorized" from the framework is less useful than our own wording.
    if (status === 401 && /^unauthorized\.?$/i.test(serverMessage)) {
        return INVALID_CREDENTIALS_MESSAGE;
    }
    return serverMessage;
}
