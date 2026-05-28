import type { ContentTypeDefinition } from '../types';

// One Q&A pair, listed by apps/web/components/marketing/faq.tsx. Non-
// routable. `category` enables simple grouping on the FAQ index without
// the overhead of a full taxonomy table for what is usually < 50 rows.

export const faqItemType: ContentTypeDefinition = {
  key: 'faq_item',
  name: 'FAQ item',
  pluralName: 'FAQ items',
  description: 'A single question-and-answer pair.',
  icon: 'circle-help',
  schema: {
    fields: [
      {
        key: 'question',
        type: 'text',
        label: 'Question',
        required: true,
        max: 280,
      },
      {
        key: 'answer',
        type: 'rich_text',
        label: 'Answer',
        required: true,
      },
      {
        key: 'category',
        type: 'text',
        label: 'Category',
        max: 60,
        helpText: 'Optional grouping label shown above the question in the FAQ index.',
      },
      {
        key: 'order',
        type: 'number',
        label: 'Order',
        integer: true,
        helpText: 'Lower numbers appear first within a category.',
      },
    ],
  },
};
