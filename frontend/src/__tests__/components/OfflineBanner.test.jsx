/**
 * Tests for the OfflineBanner component.
 *
 * Verifies that:
 *   - The banner is hidden when the browser is online
 *   - The banner appears when the 'offline' event fires
 *   - The banner disappears when the 'online' event fires
 *   - Event listeners are removed on unmount (no memory leaks)
 */

import { render, screen, act } from '@testing-library/react';
import OfflineBanner from '../../components/shared/OfflineBanner';

// Helper to fire window online/offline events
function goOffline() {
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline() {
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

beforeEach(() => {
  // Ensure browser starts as "online" before each test
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
});

describe('OfflineBanner', () => {
  test('renders nothing when online', () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  test('shows banner when offline event fires', () => {
    render(<OfflineBanner />);
    goOffline();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  test('hides banner when online event fires after going offline', () => {
    render(<OfflineBanner />);
    goOffline();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();

    goOnline();
    expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();
  });

  test('shows banner immediately when navigator.onLine is false on mount', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    render(<OfflineBanner />);
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  test('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<OfflineBanner />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    removeSpy.mockRestore();
  });
});
