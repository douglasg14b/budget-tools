import { useRegisterSW } from 'virtual:pwa-register/react';
import { Affix, Alert, Button, Group } from '@mantine/core';

/** Backstop for a tab left visible for hours; resume-from-background is the main trigger. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker and offers a reload once a new release is waiting.
 *
 * Workbox precaches index.html, so a navigation inside an installed PWA is answered from cache and
 * nginx's no-cache header on index.html never comes into play. The only way a release arrives is
 * the browser byte-comparing /sw.js — and it only does that on navigation or an explicit
 * `registration.update()`. An installed PWA resumed from the background performs no navigation at
 * all, so without the visibility check below it would run the old bundle indefinitely.
 *
 * The new worker waits rather than taking over on its own: reloading mid-classification would drop
 * unsaved work, so the user chooses when.
 */
export function AppUpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(swUrl, registration) {
            if (!registration) {
                return;
            }

            const checkForUpdate = async () => {
                if (registration.installing || !navigator.onLine) {
                    return;
                }
                // Probe first so an unreachable server does not surface as a rejected update().
                const response = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
                if (response.status === 200) {
                    await registration.update();
                }
            };
            const checkQuietly = () => {
                checkForUpdate().catch(() => undefined);
            };

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    checkQuietly();
                }
            });
            setInterval(checkQuietly, UPDATE_CHECK_INTERVAL_MS);
        },
    });

    if (!needRefresh) {
        return null;
    }

    return (
        <Affix position={{ bottom: 20, right: 20 }} zIndex={1000}>
            <Alert
                color="sage"
                title="Update available"
                role="status"
                maw={360}
                withCloseButton
                onClose={() => setNeedRefresh(false)}
            >
                <Group gap="sm" justify="space-between" wrap="nowrap">
                    <span>A new version of Budget Tools is ready.</span>
                    {/* The hook posts SKIP_WAITING and reloads once the new worker takes control. */}
                    <Button size="xs" variant="light" color="sage" onClick={() => updateServiceWorker(true)}>
                        Reload
                    </Button>
                </Group>
            </Alert>
        </Affix>
    );
}
