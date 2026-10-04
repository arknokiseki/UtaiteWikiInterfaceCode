/**
 * Skeleton
 * Shared loading states (skeleton placeholders + FontAwesome spinner) for gadgets
 * that fetch content after page load.
 *
 * Loaded by default so any gadget can rely on it, but it does no work on its own:
 * it only publishes window.Skeleton. Pages where no gadget calls it pay for the
 * stylesheet and this assignment, nothing else.
 *
 * Usage (declare ext.gadget.Skeleton in the gadget's dependencies):
 *   var loading = window.Skeleton.show(container, window.Skeleton.text({ lines: 2 }));
 *   api.get(...).then(render).always(loading.done);
 */
import { line, text, circle, block, spinner, show } from './skeleton-core.js';

const SkeletonApi = { line, text, circle, block, spinner, show };

declare global {
  interface Window {
    Skeleton?: typeof SkeletonApi;
  }
}

if (!window.Skeleton) {
  window.Skeleton = SkeletonApi;
}
