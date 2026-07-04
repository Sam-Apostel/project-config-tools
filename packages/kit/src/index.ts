import type { Plugin } from '@apostel/visual-config-core';

export type {
  Plugin,
  PluginContext,
  Detector,
  Operation,
  OperationContext,
  Change,
  ProjectModel,
  DetectedTool,
} from '@apostel/visual-config-core';

/**
 * Define a visual-config plugin. Identity function that pins the type so plugin
 * authors get full inference on the `setup` context.
 *
 * ```ts
 * export default definePlugin({
 *   id: 'oxc',
 *   setup(ctx) {
 *     ctx.registerDetector({ id: 'oxc', detect: (p) => ... });
 *     ctx.registerOperation(swapToOxlintOperation);
 *   },
 * });
 * ```
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}
