import { getBackendErrorMessage } from '../components/BackendErrorNotice';

/**
 * Mirrors the server's minimum. Kept client-side only to fail fast on an obvious mistake — the
 * server re-checks every rule and remains the authority on what it will accept.
 */
export const MIN_PASSWORD_LENGTH = 12;

const MISMATCH_MESSAGE = 'The new passwords do not match.';

const TOO_SHORT_MESSAGE = `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;

const UNCHANGED_MESSAGE = 'Your new password must be different from your current password.';

const MISSING_MESSAGE = 'Fill in every field to change your password.';

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

const FALLBACK_MESSAGE = 'Could not change your password. Please try again.';

export type ChangePasswordFields = {
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly confirmPassword: string;
};

/**
 * The client-side gate run before the network call.
 *
 * Returns the first problem worth showing, or `null` when the form is worth submitting. Only the
 * confirm-field match is genuinely client-only — the server cannot see the second box — but the
 * length and unchanged checks are duplicated here to save a round trip on a typo.
 */
export function validateChangePassword(fields: ChangePasswordFields): string | null {
    const { currentPassword, newPassword, confirmPassword } = fields;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return MISSING_MESSAGE;
    }
    // Checked before length so that two mistyped-but-matching-nothing entries report the mismatch
    // the user can actually see, rather than a length rule about a password they did not intend.
    if (newPassword !== confirmPassword) {
        return MISMATCH_MESSAGE;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return TOO_SHORT_MESSAGE;
    }
    if (newPassword === currentPassword) {
        return UNCHANGED_MESSAGE;
    }
    return null;
}

function statusOf(error: unknown): number | null {
    if (!error || typeof error !== 'object') {
        return null;
    }
    const { status } = error as { status?: unknown };
    return typeof status === 'number' ? status : null;
}

function isNetworkFailure(error: unknown): boolean {
    return error instanceof TypeError && statusOf(error) === null;
}

/**
 * Maps a rejected password change onto a sentence worth showing inline.
 *
 * The 400s and the 403 both arrive carrying the API's own `{ message }`, and that text is more
 * specific than anything we could invent here, so it wins whenever it is present. The 403 in
 * particular is a wrong current password, deliberately not a 401, so it lands here as an inline
 * error instead of tripping the global signed-out handler.
 */
export function changePasswordErrorMessage(error: unknown): string {
    if (!error) {
        return FALLBACK_MESSAGE;
    }
    if (isNetworkFailure(error)) {
        return OFFLINE_MESSAGE;
    }

    const serverMessage = getBackendErrorMessage(error, '');
    if (!serverMessage) {
        return FALLBACK_MESSAGE;
    }
    // A bare framework "Forbidden" says nothing about which field was wrong.
    if (statusOf(error) === 403 && /^forbidden\.?$/i.test(serverMessage)) {
        return 'Your current password is incorrect.';
    }
    return serverMessage;
}

/**
 * Confirmation copy. `revokedSessions` counts the user's *other* sessions; this one survives, so
 * the message has to reassure rather than imply the user is about to be kicked out.
 */
export function changePasswordSuccessMessage(revokedSessions: number): string {
    if (revokedSessions <= 0) {
        return 'Your password has been changed.';
    }
    const sessions = revokedSessions === 1 ? '1 other session' : `${revokedSessions} other sessions`;
    return `Your password has been changed. ${sessions} signed out.`;
}
