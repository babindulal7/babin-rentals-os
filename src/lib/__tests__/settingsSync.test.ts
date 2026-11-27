import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, rpcMock, captureErrorMock, applyRemoteSettingsMock, writeSettingsMock, saveUserLanguageMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  captureErrorMock: vi.fn(),
  applyRemoteSettingsMock: vi.fn(),
  writeSettingsMock: vi.fn(),
  saveUserLanguageMock: vi.fn(),
}))

vi.mock('../supabase', () => ({
  newClientUuid: () => 'uuid-1',
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}))

vi.mock('../monitoring', () => ({
  captureError: captureErrorMock,
}))

vi.mock('../languagePreferences', () => ({
  saveUserLanguage: saveUserLanguageMock,
}))

vi.mock('../settingsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settingsStore')>()
  return {
    ...actual,
    applyRemoteSettings: applyRemoteSettingsMock,
    writeSettings: writeSettingsMock,
  }
})

import { hydrateSharedSettings, saveSettings } from '../settingsSync'

describe('settingsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates remote settings and logs captureError on failure without throwing', async () => {
    fromMock.mockReturnValueOnce({
      select: async () => ({ data: [{ key: 'organisationName', value: 'Babin', scope: 'org', location_id: null }], error: null }),
    })
    await hydrateSharedSettings()
    expect(applyRemoteSettingsMock).toHaveBeenCalledTimes(1)

    fromMock.mockReturnValueOnce({
      select: async () => ({ data: null, error: { message: 'offline' } }),
    })
    await hydrateSharedSettings()
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
  })

  it('writes shared settings via RPC and unwraps GATE prefixes on refusal', async () => {
    rpcMock.mockResolvedValueOnce({ error: null })
    await saveSettings({ organisationName: 'Babin Studio' })
    expect(rpcMock).toHaveBeenCalledWith(
      'set_setting',
      expect.objectContaining({ p_key: 'organisationName', p_value: 'Babin Studio' }),
    )

    rpcMock.mockResolvedValueOnce({ error: { message: 'GATE:P3|Only Owner may change this.' } })
    await expect(saveSettings({ organisationName: 'X' })).rejects.toThrow('Only Owner may change this.')
  })
})
