import { ArrowLeft, Download, ExternalLink, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { siteContent } from '../content/siteContent';
import { PUBLIC_DEMO_HOUSEHOLD_CODE } from '../features/rsvp/householdCode';

const SHARED_RSVP_URL = 'https://lisetteenbjarty.nl/#rsvp';

const downloadSharedQr = () => {
  const qr = document.getElementById('shared-rsvp-qr');
  if (!(qr instanceof SVGElement)) return;

  const source = new XMLSerializer().serializeToString(qr);
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = 'lisette-bjarty-rsvp-qr.svg';
  link.click();
  URL.revokeObjectURL(blobUrl);
};

const DecorativeCorners = () => (
  <div className="pointer-events-none absolute inset-4 border border-gold/55 sm:inset-5" aria-hidden="true">
    <span className="absolute -left-px -top-px h-10 w-10 border-l-2 border-t-2 border-[#8A5A03]" />
    <span className="absolute -right-px -top-px h-10 w-10 border-r-2 border-t-2 border-[#8A5A03]" />
    <span className="absolute -bottom-px -left-px h-10 w-10 border-b-2 border-l-2 border-[#8A5A03]" />
    <span className="absolute -bottom-px -right-px h-10 w-10 border-b-2 border-r-2 border-[#8A5A03]" />
  </div>
);

export default function InvitationPreview() {
  const { event } = siteContent;

  return (
    <main id="invitation-preview" className="invitation-preview-shell min-h-screen bg-stone-dark px-4 py-8 text-stone-dark sm:px-8 sm:py-12">
      <div className="invitation-preview-controls mx-auto mb-8 max-w-6xl rounded-3xl border border-gold/25 bg-cream p-5 shadow-2xl sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8A5A03]">Lokale drukproef</p>
          <h1 className="mt-2 text-3xl">Voorbeeld Familie Garcia</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-dark/65">
            Fictieve daggastuitnodiging. De zichtbare code werkt alleen in de lokale demonstratie en is geen echte toegangscode.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 sm:mt-0 sm:justify-end">
          <a
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-dark/15 px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] outline-none hover:border-[#8A5A03] focus-visible:ring-4 focus-visible:ring-gold/30"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Site
          </a>
          <button
            type="button"
            onClick={downloadSharedQr}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-dark/15 px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] outline-none hover:border-[#8A5A03] focus-visible:ring-4 focus-visible:ring-gold/30"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            QR als SVG
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-dark/15 px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] outline-none hover:border-[#8A5A03] focus-visible:ring-4 focus-visible:ring-gold/30"
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            Print
          </button>
          <a
            href="/?demo=invitation#rsvp"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-stone-dark px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-cream outline-none hover:bg-[#8A5A03] focus-visible:ring-4 focus-visible:ring-gold/30"
          >
            Test RSVP
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="invitation-preview-grid mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
        <section aria-labelledby="invitation-front-label">
          <p id="invitation-front-label" className="invitation-side-label mb-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-cream/65">
            Voorzijde
          </p>
          <article className="invitation-sheet relative mx-auto flex min-h-[48rem] aspect-[148/210] w-full max-w-[36rem] flex-col items-center justify-center overflow-hidden bg-cream px-[11%] py-[12%] text-center shadow-2xl sm:min-h-0">
            <DecorativeCorners />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(202,138,4,0.13),transparent_34%),radial-gradient(circle_at_15%_90%,rgba(28,25,23,0.06),transparent_30%)]" aria-hidden="true" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#8A5A03]/55 font-accent text-3xl italic text-[#8A5A03] sm:h-24 sm:w-24 sm:text-4xl">
                {event.couple.monogram}
              </div>
              <p className="mt-10 text-[0.68rem] font-bold uppercase tracking-[0.35em] text-stone-dark/60 sm:text-xs">
                Wij gaan trouwen
              </p>
              <h2 className="mt-7 text-5xl leading-[0.95] tracking-tight sm:text-7xl">
                {event.couple.firstName}
                <span className="block py-2 font-accent text-4xl italic text-[#8A5A03] sm:text-5xl">&</span>
                {event.couple.secondName}
              </h2>
              <div className="my-9 h-px w-24 bg-[#8A5A03]/60" aria-hidden="true" />
              <p className="text-sm font-bold uppercase tracking-[0.18em] sm:text-base">
                Zaterdag {event.date.display}
              </p>
              <p className="mt-3 font-accent text-xl italic text-stone-dark/70 sm:text-2xl">
                {event.venue.roomName} · {event.place}
              </p>
            </div>
          </article>
        </section>

        <section aria-labelledby="invitation-back-label">
          <p id="invitation-back-label" className="invitation-side-label mb-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-cream/65">
            Achterzijde
          </p>
          <article className="invitation-sheet relative mx-auto flex min-h-[48rem] aspect-[148/210] w-full max-w-[36rem] flex-col overflow-hidden bg-cream px-[10%] py-[10%] text-center shadow-2xl sm:min-h-0">
            <DecorativeCorners />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_5%,rgba(202,138,4,0.12),transparent_28%),radial-gradient(circle_at_5%_95%,rgba(28,25,23,0.05),transparent_28%)]" aria-hidden="true" />
            <div className="relative z-10 flex h-full flex-col items-center">
              <p className="font-accent text-3xl italic text-[#8A5A03] sm:text-4xl">Lieve familie Garcia,</p>
              <p className="mt-5 max-w-md text-sm font-light leading-relaxed text-stone-dark/75 sm:text-base">
                We vieren deze bijzondere dag heel graag samen met jullie.
              </p>

              <div className="mt-7 w-full border-y border-[#8A5A03]/25 py-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-dark/55">Ontvangst</p>
                <p className="mt-1 font-serif text-xl sm:text-2xl">14.30 – 15.00 uur</p>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-stone-dark/55">Ceremonie</p>
                <p className="mt-1 font-serif text-xl sm:text-2xl">15.00 uur</p>
              </div>

              <p className="mt-5 text-sm font-bold">{event.venue.roomName} · {event.venue.organisationName}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-dark/65 sm:text-sm">{event.venue.address}</p>
              <p className="mt-5 text-xs font-semibold leading-relaxed text-stone-dark/70 sm:text-sm">
                Laat ons uiterlijk {event.rsvpDeadline.display} weten of jullie erbij zijn.
              </p>

              <figure className="mt-5 flex flex-col items-center">
                <div className="invitation-qr rounded-xl bg-white p-2.5 ring-1 ring-stone-dark/10">
                  <QRCodeSVG
                    id="shared-rsvp-qr"
                    value={SHARED_RSVP_URL}
                    size={176}
                    level="Q"
                    marginSize={4}
                    bgColor="#FFFFFF"
                    fgColor="#1C1917"
                    title="QR-code naar de RSVP-sectie van lisetteenbjarty.nl"
                    aria-label="QR-code naar lisetteenbjarty.nl, RSVP"
                  />
                </div>
                <figcaption className="mt-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-stone-dark/65 sm:text-xs">
                  Scan voor alle informatie en RSVP
                </figcaption>
              </figure>

              <p className="mt-2 text-xs font-semibold text-stone-dark/65">lisetteenbjarty.nl</p>
              <p className="mt-4 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-stone-dark/55 sm:text-xs">
                Gebruik daarna jullie persoonlijke code
              </p>
              <p className="mt-2 select-all font-mono text-sm font-bold tracking-[0.12em] text-stone-dark sm:text-base">
                {PUBLIC_DEMO_HOUSEHOLD_CODE}
              </p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
