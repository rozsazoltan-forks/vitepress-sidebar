import type { VitePressSidebarOptions } from './types.ts';
import { join, sep } from 'path';
import { utimesSync } from 'fs';

interface MinimalViteDevServer {
  watcher: {
    on(event: 'add' | 'unlink', cb: (path: string) => void): void;
  };
}

interface MinimalVitePlugin {
  name: string;
  apply?: 'serve' | 'build';
  configureServer?: (server: MinimalViteDevServer) => void;
}

export function createSidebarHmrPlugin(
  sidebarOptions?: VitePressSidebarOptions | VitePressSidebarOptions[]
): MinimalVitePlugin {
  const optionList: VitePressSidebarOptions[] = sidebarOptions
    ? Array.isArray(sidebarOptions)
      ? sidebarOptions
      : [sidebarOptions]
    : [{}];

  const watchedRoots = optionList.map((item) => {
    let docPath = item.documentRootPath ?? '/';
    if (!docPath.startsWith('/')) docPath = `/${docPath}`;
    return join(process.cwd(), docPath);
  });

  return {
    name: 'vitepress-sidebar:hmr',
    apply: 'serve',
    configureServer(server) {
      const isInsideDocs = (file: string): boolean =>
        watchedRoots.some((root) => file === root || file.startsWith(root + sep));

      // Touch the VitePress config file so its own watcher picks up the change
      // and goes through `recreateServer`, which is the only safe way to make
      // VitePress re-evaluate `withSidebar` and refresh the sidebar in dev.
      // Calling Vite's `server.restart()` directly conflicts with VitePress's
      // server lifecycle and produces "server restart failed".
      const touchConfig = (): void => {
        const configPath = (globalThis as unknown as { VITEPRESS_CONFIG?: { configPath?: string } })
          .VITEPRESS_CONFIG?.configPath;

        if (!configPath) {
          return;
        }

        const now = new Date();

        try {
          utimesSync(configPath, now, now);
        } catch {
          // Ignore
        }
      };

      const handler = (file: string): void => {
        if (!file.endsWith('.md')) {
          return;
        }

        if (!isInsideDocs(file)) {
          return;
        }

        touchConfig();
      };

      server.watcher.on('add', handler);
      server.watcher.on('unlink', handler);
    }
  };
}
