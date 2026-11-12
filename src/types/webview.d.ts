import type React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: string | boolean;
          useragent?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
