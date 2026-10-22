import { describe, it, expect } from 'vitest'
import {
  inferCategoryFromName,
  cleanTasksForCategory,
  resetTasksForCategory,
  allTasksForCategory,
  queueTimeTone,
  type Category,
} from '@/data/reset'

describe('Reset Workspace Expansion (Phase 4)', () => {
  describe('inferCategoryFromName', () => {
    it('accurately classifies cinema cameras', () => {
      expect(inferCategoryFromName('Sony FX6 Full-Frame Cinema Camera')).toBe('Camera')
      expect(inferCategoryFromName('RED Komodo 6K Body')).toBe('Camera')
      expect(inferCategoryFromName('ARRI Alexa Mini LF')).toBe('Camera')
      expect(inferCategoryFromName('Blackmagic Pocket 6K Pro')).toBe('Camera')
    })

    it('accurately classifies cinema lenses', () => {
      expect(inferCategoryFromName('Canon CN-E 50mm T1.3 L F Cinema Prime')).toBe('Lens')
      expect(inferCategoryFromName('DZOFilm Pictor 20-55mm T2.8 Zoom')).toBe('Lens')
      expect(inferCategoryFromName('Sony FE 24-70mm f/2.8 GM II')).toBe('Lens')
    })

    it('accurately classifies power and battery accessories', () => {
      expect(inferCategoryFromName('Core SWX Hypercore NEO 98Wh V-Mount Battery')).toBe('Battery')
      expect(inferCategoryFromName('Anton Bauer Titon 150 V-Mount')).toBe('Battery')
    })

    it('accurately classifies monitors and transmission', () => {
      expect(inferCategoryFromName('SmallHD Indie 7 Touchscreen Monitor')).toBe('Monitor')
      expect(inferCategoryFromName('Atomos Ninja V+ 5.2" 8K HDMI Recorder')).toBe('Monitor')
    })

    it('accurately classifies media and storage', () => {
      expect(inferCategoryFromName('Angelbird 512GB AV PRO CFexpress Type B')).toBe('Media')
      expect(inferCategoryFromName('SanDisk 128GB Extreme PRO CFast Card')).toBe('Media')
    })

    it('accurately classifies support rigs and stabilization', () => {
      expect(inferCategoryFromName('DJI RS3 Pro Gimbal Stabilizer Combo')).toBe('Rig')
      expect(inferCategoryFromName('Sachtler Ace M Fluid Head Tripod')).toBe('Rig')
      expect(inferCategoryFromName('Tilta Mirage Matte Box')).toBe('Rig')
    })

    it('accurately classifies audio equipment', () => {
      expect(inferCategoryFromName('Sennheiser MKH 416 Shotgun Microphone')).toBe('Audio')
      expect(inferCategoryFromName('Rode Wireless GO II Dual Wireless System')).toBe('Audio')
    })

    it('falls back to Accessory for unknown items', () => {
      expect(inferCategoryFromName('Bongo Ties 10-pack Standard')).toBe('Accessory')
      expect(inferCategoryFromName('Generic Pelican 1510 Hard Case')).toBe('Accessory')
    })
  })

  describe('category-specific cleaning & reset task checklists', () => {
    const categories: Category[] = [
      'Camera',
      'Lens',
      'Battery',
      'Media',
      'Monitor',
      'Rig',
      'Audio',
      'Accessory',
    ]

    it('provides non-empty cleaning and reset task lists for every cinema category', () => {
      for (const cat of categories) {
        const cleanTasks = cleanTasksForCategory(cat)
        const resetTasks = resetTasksForCategory(cat)
        const allTasks = allTasksForCategory(cat)

        expect(cleanTasks.length).toBeGreaterThan(0)
        expect(resetTasks.length).toBeGreaterThan(0)
        expect(allTasks.length).toBe(cleanTasks.length + resetTasks.length)
      }
    })

    it('includes sensor & optical safety tasks specifically for camera and lenses', () => {
      const cameraTasks = allTasksForCategory('Camera')
      const lensTasks = allTasksForCategory('Lens')

      expect(cameraTasks.some((t) => t.toLowerCase().includes('sensor'))).toBe(true)
      expect(lensTasks.some((t) => t.toLowerCase().includes('element'))).toBe(true)
    })

    it('includes storage wipe / media format tasks for media category', () => {
      const mediaTasks = allTasksForCategory('Media')
      expect(mediaTasks.some((t) => t.toLowerCase().includes('format'))).toBe(true)
    })
  })

  describe('queue turnaround time indicators (queueTimeTone)', () => {
    it('returns danger tone when waiting minutes exceed 240m (4 hours)', () => {
      expect(queueTimeTone(241)).toBe('danger')
      expect(queueTimeTone(500)).toBe('danger')
    })

    it('returns progress tone when waiting minutes are between 121m and 240m', () => {
      expect(queueTimeTone(121)).toBe('progress')
      expect(queueTimeTone(240)).toBe('progress')
    })

    it('returns neutral tone for items under 120m (2 hours)', () => {
      expect(queueTimeTone(30)).toBe('neutral')
      expect(queueTimeTone(120)).toBe('neutral')
    })
  })
})
