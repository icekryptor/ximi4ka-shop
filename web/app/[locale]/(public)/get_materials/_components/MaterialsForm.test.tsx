import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MaterialsForm } from './MaterialsForm'
import { ApiError } from '@/lib/api'

const mockPush = vi.fn<(path: string) => void>()
const submitMaterialLead = vi.hoisted(() => vi.fn())
const reachGoal = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  submitMaterialLead,
}))
vi.mock('@/lib/metrika', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/metrika')>()),
  reachGoal,
}))

beforeEach(() => {
  mockPush.mockReset()
  submitMaterialLead.mockReset()
  submitMaterialLead.mockResolvedValue({ id: 'lead-1' })
  reachGoal.mockReset()
})

afterEach(cleanup)

function fill(name: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
}

function fillValid() {
  fill(/имя/i, 'Мария')
  fill(/телефон/i, '9859938311')
  fireEvent.click(screen.getByRole('checkbox'))
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /получить методичку/i }))

describe('<MaterialsForm>', () => {
  it('lists the ten "how did you hear" options', () => {
    render(<MaterialsForm />)
    const select = screen.getByLabelText(/как вы о нас узнали/i) as HTMLSelectElement
    expect(select.options).toHaveLength(10)
    expect(select.value).toBe('Получил в подарок')
  })

  it('links the privacy policy next to the consent checkbox', () => {
    render(<MaterialsForm />)
    expect(screen.getByRole('link', { name: /политикой конфиденциальности/i })).toHaveAttribute(
      'href',
      '/policy',
    )
  })

  it('submits the lead, fires the goal and opens the thank-you page', async () => {
    render(<MaterialsForm />)
    fillValid()
    fill(/telegram|телеграм/i, 't.me/maria_chem')
    fireEvent.change(screen.getByLabelText(/как вы о нас узнали/i), {
      target: { value: 'Нашел на ВБ' },
    })
    submit()
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/get_materials/thanks'))
    expect(submitMaterialLead).toHaveBeenCalledWith({
      name: 'Мария',
      phone: '+7 (985) 993-83-11',
      telegram: 't.me/maria_chem',
      source: 'Нашел на ВБ',
      website: '',
      consent: true,
    })
    expect(reachGoal).toHaveBeenCalledWith('material_lead')
  })

  it('omits an empty Telegram field from the request', async () => {
    render(<MaterialsForm />)
    fillValid()
    submit()
    await waitFor(() => expect(submitMaterialLead).toHaveBeenCalled())
    expect(submitMaterialLead.mock.calls[0][0]).not.toHaveProperty('telegram')
  })

  it('blocks submit and shows errors for an empty form', () => {
    render(<MaterialsForm />)
    submit()
    expect(screen.getByText('Введите имя')).toBeInTheDocument()
    expect(screen.getByText(/укажите телефон полностью/i)).toBeInTheDocument()
    expect(screen.getByText(/нужно согласие/i)).toBeInTheDocument()
    expect(submitMaterialLead).not.toHaveBeenCalled()
  })

  it('rejects a malformed Telegram handle', () => {
    render(<MaterialsForm />)
    fillValid()
    fill(/telegram|телеграм/i, 'a b')
    submit()
    expect(screen.getByText(/5–32 латинских/i)).toBeInTheDocument()
    expect(submitMaterialLead).not.toHaveBeenCalled()
  })

  it('shows the server message and stays on the page when the api fails', async () => {
    submitMaterialLead.mockRejectedValue(
      new ApiError(429, 'rate_limited', 'Слишком много запросов'),
    )
    render(<MaterialsForm />)
    fillValid()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много запросов')
    expect(mockPush).not.toHaveBeenCalled()
  })
})
