import { Compass } from 'lucide-react';

export default function Home() {
  return (
    <main className="page">
      <section className="intro">
        <h1>Worldloom</h1>
        <p>
          Scrivi personaggi, luoghi ed eventi come snippet, collegali con relazioni tue e guarda lo
          stesso mondo come timeline, mappa o grafo.
        </p>
        <span className="status">
          <Compass size={16} aria-hidden="true" />
          Il primo mondo è in costruzione
        </span>
      </section>
    </main>
  );
}
