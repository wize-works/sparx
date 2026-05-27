import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form';
import { Input } from './input';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
});
type Schema = z.infer<typeof schema>;

function Fixture({ onValidSubmit }: { onValidSubmit?: (v: Schema) => void }) {
  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
    mode: 'onSubmit',
  });
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => {
          onValidSubmit?.(v);
        })}
        noValidate
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>We never share it.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Save</button>
      </form>
    </Form>
  );
}

describe('Form / FormField composition', () => {
  it('wires label htmlFor to the input id (click label focuses input)', () => {
    render(<Fixture />);
    const label = screen.getByText('Email');
    const input = screen.getByRole('textbox');
    expect(label).toHaveAttribute('for');
    expect(input).toHaveAttribute('id', label.getAttribute('for'));
  });

  it('shows the description and links it via aria-describedby on the control', () => {
    render(<Fixture />);
    const input = screen.getByRole('textbox');
    const description = screen.getByText('We never share it.');
    expect(input.getAttribute('aria-describedby')).toContain(description.id);
  });

  it('renders the Zod validation message and sets aria-invalid on submit', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Enter a valid email');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('submits when validation passes', async () => {
    const onValidSubmit = vi.fn();
    render(<Fixture onValidSubmit={onValidSubmit} />);

    await userEvent.type(screen.getByRole('textbox'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onValidSubmit).toHaveBeenCalledWith({ email: 'me@example.com' });
    });
  });
});
