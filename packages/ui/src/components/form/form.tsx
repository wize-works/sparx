'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
} from 'react-hook-form';
import { cn } from '../../utils/cn';
import { Label } from '../primitives/label';

// This is the standard shadcn-shaped composition over react-hook-form, with
// Sparx tokens. Consumers wire it up like:
//
//   const form = useForm({ resolver: zodResolver(schema), defaultValues });
//   <Form {...form}>
//     <form onSubmit={form.handleSubmit(onSubmit)}>
//       <FormField name="email" render={({ field }) => (
//         <FormItem>
//           <FormLabel required>Email</FormLabel>
//           <FormControl><Input {...field} /></FormControl>
//           <FormDescription>We'll never share it.</FormDescription>
//           <FormMessage />
//         </FormItem>
//       )} />
//     </form>
//   </Form>

export const Form = FormProvider;

// ── Internal contexts ─────────────────────────────────────
interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

interface FormItemContextValue {
  id: string;
}
const FormItemContext = React.createContext<FormItemContextValue | null>(null);

// ── Field wrapper ─────────────────────────────────────────
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────
export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (!fieldContext) {
    throw new Error('useFormField must be used inside a <FormField>');
  }
  if (!itemContext) {
    throw new Error('useFormField must be used inside a <FormItem>');
  }

  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

// ── FormItem ──────────────────────────────────────────────
export const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const id = React.useId();
    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...props} />
      </FormItemContext.Provider>
    );
  }
);
FormItem.displayName = 'FormItem';

// ── FormLabel ─────────────────────────────────────────────
export const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();
  return (
    <Label
      ref={ref}
      htmlFor={formItemId}
      className={cn(error && 'text-[var(--color-danger-text)]', className)}
      {...props}
    />
  );
});
FormLabel.displayName = 'FormLabel';

// ── FormControl ───────────────────────────────────────────
// Slot pattern: passes id, aria-describedby, aria-invalid through to the
// child input element so consumers can drop in any control unchanged.
export const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

// ── FormDescription ───────────────────────────────────────
export const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-xs text-[var(--color-text-secondary)]', className)}
      {...props}
    />
  );
});
FormDescription.displayName = 'FormDescription';

// ── FormMessage ───────────────────────────────────────────
export const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message ?? '') : children;
  if (!body) return null;
  return (
    <p
      ref={ref}
      id={formMessageId}
      role="alert"
      className={cn('text-xs font-medium text-[var(--color-danger-text)]', className)}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = 'FormMessage';
