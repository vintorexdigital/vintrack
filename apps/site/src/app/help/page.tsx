import type { Metadata } from 'next';
import { HelpSearch } from '../../components/help-search';
import { Section } from '../../components/chrome';
import { ARTICLES } from '../../content/help';

export const metadata: Metadata = { title: 'Help center', description: 'Guides for setting up and using Trackrex.' };

export default function Help() {
  return (
    <Section title="Help center" intro="Short guides for admins, managers and employees.">
      <HelpSearch articles={ARTICLES.map(({ slug, title, summary, category }) => ({ slug, title, summary, category }))} />
    </Section>
  );
}
