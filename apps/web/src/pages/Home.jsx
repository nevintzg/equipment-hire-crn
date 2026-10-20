import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Markdown, Spinner, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';
import { useSite } from '../lib/site.jsx';
import EquipmentCard from '../components/EquipmentCard.jsx';

function Hero({ section, site }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const heading = site.setting('site.heroHeading') || section?.heading || `Hire from ${site.name}`;
  const sub = site.setting('site.heroSubheading') || section?.subheading;
  return (
    <section className="hero">
      <h1>{heading}</h1>
      {sub && <p>{sub}</p>}
      <form
        className="hero-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/equipment${q ? `?search=${encodeURIComponent(q)}` : ''}`);
        }}
      >
        <label className="sr-only" htmlFor="hero-q">
          Search equipment
        </label>
        <input
          id="hero-q"
          className="input"
          placeholder="Marquee, chairs, PA system…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-lg" type="submit">
          {section?.ctaLabel || 'Search'}
        </button>
      </form>
    </section>
  );
}

function CategoryGrid({ section, categories }) {
  const top = categories.filter((c) => !c.parentId);
  if (!top.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>{section.heading || 'Browse by category'}</h2>
        <Link to="/equipment">See everything →</Link>
      </div>
      <div className="grid" style={{ '--min': '220px' }}>
        {top.map((c) => (
          <Link key={c.id} to={`/equipment?category=${c.slug}`} className="category-tile">
            <strong>{c.name}</strong>
            {c.description && <span className="muted">{c.description}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Steps({ section }) {
  const steps = section.config?.steps ?? [];
  if (!steps.length) return null;
  return (
    <section className="section">
      <h2>{section.heading}</h2>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i}>
            <div>{typeof s === 'string' ? s : s.title}</div>
            {typeof s === 'object' && s.body && (
              <p className="muted" style={{ fontWeight: 400 }}>
                {s.body}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Cta({ section }) {
  return (
    <section className="section cta-band spread">
      <div>
        <h2>{section.heading}</h2>
        {section.subheading && (
          <p className="muted" style={{ margin: 0 }}>
            {section.subheading}
          </p>
        )}
      </div>
      {section.ctaHref && (
        <Link to={section.ctaHref} className="btn btn-primary btn-lg">
          {section.ctaLabel || 'Find out more'}
        </Link>
      )}
    </section>
  );
}

function TextSection({ section }) {
  return (
    <section className="section">
      {section.heading && <h2>{section.heading}</h2>}
      {section.subheading && <p className="muted">{section.subheading}</p>}
      {section.bodyMarkdown && <Markdown source={section.bodyMarkdown} />}
    </section>
  );
}

function Featured() {
  const { data, isPending } = useQuery({
    queryKey: ['equipment', 'featured'],
    queryFn: () => api.list('/equipment', { pageSize: 8 }),
  });
  if (isPending) return <Spinner />;
  if (!data?.data?.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>Popular equipment</h2>
        <Link to="/equipment">Browse all →</Link>
      </div>
      <div className="grid" style={{ '--min': '230px' }}>
        {data.data.map((item) => (
          <EquipmentCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const site = useSite();
  useTitle(site.name);
  const { data: sections = [] } = useQuery({
    queryKey: ['site', 'home'],
    queryFn: () => api.get('/site/home'),
    staleTime: 60_000,
  });

  const hero = sections.find((s) => s.kind === 'HERO');
  const rest = sections.filter((s) => s.kind !== 'HERO');
  const hasGrid = rest.some((s) => s.kind === 'CATEGORY_GRID');

  return (
    <div className="container">
      <Hero section={hero} site={site} />
      {!hasGrid && <CategoryGrid section={{}} categories={site.categories} />}
      {rest.map((s) => {
        switch (s.kind) {
          case 'CATEGORY_GRID':
            return (
              <div key={s.id}>
                <CategoryGrid section={s} categories={site.categories} />
                <Featured />
              </div>
            );
          case 'STEPS':
            return <Steps key={s.id} section={s} />;
          case 'CTA':
            return <Cta key={s.id} section={s} />;
          default:
            return <TextSection key={s.id} section={s} />;
        }
      })}
      {!hasGrid && <Featured />}
    </div>
  );
}
