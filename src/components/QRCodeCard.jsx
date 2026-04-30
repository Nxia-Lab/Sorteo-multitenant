import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRCodeCard({ branch, url }) {
  const [src, setSrc] = useState('');
  const actionClassName =
    'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border-soft)] px-5 text-center text-xs font-semibold uppercase leading-none tracking-[0.2em] transition hover:border-[var(--accent-strong)] hover:bg-[var(--accent-soft)]';

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    }).then((value) => {
      if (!cancelled) {
        setSrc(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return;
      }
    } catch {
      // Fallback below.
    }

    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function printQr() {
    if (!src) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=520,height=680');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>QR ${branch}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 32px; text-align: center; color: #111827; }
            img { width: 320px; height: 320px; }
            h1 { font-size: 24px; margin: 0 0 16px; }
            p { font-size: 12px; word-break: break-all; color: #475569; }
          </style>
        </head>
        <body>
          <h1>${branch}</h1>
          <img src="${src}" alt="QR ${branch}" />
          <p>${url}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <div className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--panel)] p-4 sm:p-5">
      <p className="text-sm font-medium text-[var(--text-primary)] sm:text-base">{branch}</p>
      <div className="mt-4 flex justify-center rounded-[20px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3 sm:p-4">
        {src ? <img alt={`QR ${branch}`} className="h-36 w-36 rounded-xl sm:h-44 sm:w-44" src={src} /> : <div className="h-36 w-36 animate-pulse rounded-xl bg-[var(--accent-soft)] sm:h-44 sm:w-44" />}
      </div>
      <p className="mt-4 break-all text-xs leading-5 text-[var(--text-secondary)]">{url}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          className={`${actionClassName} text-[var(--accent-strong)]`}
          onClick={copyLink}
          type="button"
        >
          Copiar link
        </button>
        <a
          className={`${actionClassName} text-[var(--text-primary)]`}
          href={url}
          rel="noreferrer"
          target="_blank"
          title="Ver la pantalla pública que abre este QR"
        >
          Vista cliente
        </a>
        <button
          className={`${actionClassName} text-[var(--text-primary)]`}
          onClick={printQr}
          type="button"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
}
