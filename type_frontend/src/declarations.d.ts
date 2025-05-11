declare module "xterm" {
  export interface ITerminalAddon {
    activate(terminal: Terminal): void;
    dispose(): void;
  }

  export interface ITerminalOptions {
    cursorBlink?: boolean;
    theme?: {
      background: string;
      foreground: string;
    };
    fontFamily?: string;
    fontSize?: number;
    scrollback?: number;
  }

  export class Terminal {
    cols: number;
    rows: number;
    constructor(options?: ITerminalOptions);
    open(container: HTMLElement): void;
    write(data: string): void;
    onData(callback: (data: string) => void): void;
    dispose(): void;
    loadAddon(addon: ITerminalAddon): void;
  }
}

declare module "xterm-addon-fit" {
  import { Terminal, ITerminalAddon } from "xterm";

  export class FitAddon implements ITerminalAddon {
    activate(terminal: Terminal): void;
    dispose(): void;
    fit(): void;
  }
}

declare module "xterm-addon-web-links" {
  import { Terminal, ITerminalAddon } from "xterm";

  export class WebLinksAddon implements ITerminalAddon {
    constructor(handler?: (event: MouseEvent, uri: string) => void);
    activate(terminal: Terminal): void;
    dispose(): void;
  }
}
