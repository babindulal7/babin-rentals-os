import base from '../vitest.config'
import { mergeConfig, defineConfig } from 'vitest/config'
export default mergeConfig(base, defineConfig({ test: { include: ['audit-evidence/*.test.tsx'] } }))
