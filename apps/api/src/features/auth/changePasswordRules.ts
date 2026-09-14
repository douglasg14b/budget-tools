import { passwordComplaint } from './password';

/**
 * Validation for a self-service password change, kept pure so it can be unit-tested and so the
 * controller reads as orchestration only. Returns a user-facing complaint, or undefined when the
 * new password is acceptable.
 *
 * Deliberately does NOT check the current password — that requires an argon2 verification against
 * the stored hash and belongs in the controller. This covers only what can be judged from the two
 * strings themselves.
 */
export function changePasswordComplaint(currentPassword: string, newPassword: string): string | undefined {
    if (!currentPassword) {
        return 'Enter your current password.';
    }

    if (!newPassword) {
        return 'Enter a new password.';
    }

    const complaint = passwordComplaint(newPassword);
    if (complaint) {
        return complaint;
    }

    if (newPassword === currentPassword) {
        return 'The new password must be different from your current one.';
    }

    return undefined;
}
