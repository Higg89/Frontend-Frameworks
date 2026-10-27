import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { QBtn, QInput } from 'quasar';
import { describe, expect, it } from 'vitest';
import TodoForm from '@/components/TodoForm.vue';
import { validationMessages } from '@/utils/validation';

function mountForm(loading = false): VueWrapper {
  return mount(TodoForm, { props: { loading } });
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

async function typeTitle(wrapper: VueWrapper, value: string): Promise<void> {
  await wrapper.find('input').setValue(value);
  await flushPromises();
}

describe('TodoForm', () => {
  it('renders a labelled input and a submit button', () => {
    const wrapper = mountForm();

    expect(wrapper.text()).toContain('Новая задача');
    expect(wrapper.find('input').exists()).toBe(true);
    expect(wrapper.findComponent(QBtn).props('label')).toBe('Добавить');
  });

  it('does not emit submit for an empty title', async () => {
    const wrapper = mountForm();

    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain(validationMessages.titleRequired);
  });

  it('rejects a whitespace-only title', async () => {
    const wrapper = mountForm();

    await typeTitle(wrapper, '    ');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain(validationMessages.titleRequired);
  });

  it('emits a trimmed title and resets the form', async () => {
    const wrapper = mountForm();

    await typeTitle(wrapper, '  Купить хлеб  ');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toEqual([['Купить хлеб']]);
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('');
    expect(wrapper.text()).not.toContain(validationMessages.titleRequired);
  });

  it('rejects a title with repeated spaces', async () => {
    const wrapper = mountForm();

    await typeTitle(wrapper, 'Купить  хлеб');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain(validationMessages.titleSpaces);
  });

  it('rejects a title longer than 200 characters', async () => {
    const wrapper = mountForm();

    await typeTitle(wrapper, 'a'.repeat(201));
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain(validationMessages.titleTooLong);
  });

  it('clears the error after a valid submission', async () => {
    const wrapper = mountForm();

    await submit(wrapper);
    expect(wrapper.text()).toContain(validationMessages.titleRequired);

    await typeTitle(wrapper, 'Новая задача');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toEqual([['Новая задача']]);
    expect(wrapper.find('.form-error').exists()).toBe(false);
  });

  it('validates the field on blur', async () => {
    const wrapper = mountForm();

    wrapper.findComponent(QInput).vm.$emit('blur');
    await flushPromises();

    expect(wrapper.text()).toContain(validationMessages.titleRequired);
  });

  it('disables the input and the button while loading', () => {
    const wrapper = mountForm(true);

    expect(wrapper.findComponent(QInput).props('disable')).toBe(true);
    expect(wrapper.findComponent(QBtn).props('disable')).toBe(true);
    expect(wrapper.findComponent(QBtn).props('loading')).toBe(true);
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });

  it('keeps the current value when loading starts', async () => {
    const wrapper = mountForm();

    await typeTitle(wrapper, 'Незавершённая задача');
    await wrapper.setProps({ loading: true });

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Незавершённая задача');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('shows no error before interaction', () => {
    const wrapper = mountForm();

    expect(wrapper.find('.form-error').exists()).toBe(false);
  });

  it('emits submit only once per click on a valid form', async () => {
    const wrapper = mountForm();

    await typeTitle(wrapper, 'Одна задача');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toHaveLength(1);
  });
});
