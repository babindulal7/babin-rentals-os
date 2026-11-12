import { useState, useMemo } from 'react'
import {
  PUBLIC_CATALOGUE_ITEMS,
  evaluatePublicSchedule,
  getCatalogueItemAvailability,
  type PublicScheduleState,
} from './publicCatalogueData'
import { formatMoney } from '../lib/money'

const CATEGORIES = ['All', 'Camera', 'Lens', 'Lighting', 'Support', 'Audio', 'Power', 'Media'] as const

export default function PublicGearCatalogue() {
  const [schedule, setSchedule] = useState<PublicScheduleState>({
    pickupDate: '',
    pickupTime: '06:00',
    returnDate: '',
    returnTime: '06:00',
  })

  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')

  const evaluation = useMemo(() => evaluatePublicSchedule(schedule), [schedule])

  const filteredItems = useMemo(() => {
    return PUBLIC_CATALOGUE_ITEMS.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [selectedCategory, searchQuery])

  const handleDatePreset = (daysSpan: number) => {
    // Current business baseline or forward anchor
    const base = new Date()
    const pDate = new Date(base.getTime() + 86400000) // tomorrow
    const rDate = new Date(pDate.getTime() + daysSpan * 86400000)

    const pStr = pDate.toISOString().slice(0, 10)
    const rStr = rDate.toISOString().slice(0, 10)

    setSchedule({
      pickupDate: pStr,
      pickupTime: '06:00',
      returnDate: rStr,
      returnTime: '06:00',
    })
  }

  return (
    <section id="catalogue" className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gold/30 bg-gold/10 text-gold text-xs font-mono uppercase tracking-widest mb-4">
          Public Gear Catalogue
        </div>
        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-bone">
          Live Inventory &amp; Production Gear
        </h2>
        <p className="mt-4 text-base sm:text-lg text-ash">
          Select both pickup and return date &amp; time to unlock live gear availability, bookable stock counts,
          and transparent daily rates in Kathmandu (+05:45 NPT).
        </p>
      </div>

      {/* Date & Time Selector / Gating Box */}
      <div
        data-testid="schedule-picker-box"
        className="rounded-3xl border border-slate-line bg-ink-2/90 backdrop-blur-xl p-6 sm:p-8 mb-12 shadow-2xl relative overflow-hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-line/60">
          <div>
            <h3 className="font-display text-xl sm:text-2xl font-semibold text-bone flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-gold" />
              1. Choose Rental Schedule (06:00 AM Boundary)
            </h3>
            <p className="text-xs sm:text-sm text-ash mt-1">
              Aligned to Asia/Kathmandu (+05:45). Operational day rolls over at 06:00 AM.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ash/70 font-mono">Quick Presets:</span>
            <button
              type="button"
              onClick={() => handleDatePreset(1)}
              className="px-3 py-1.5 rounded-lg border border-slate-line bg-ink-3 hover:border-gold/50 text-xs font-medium text-bone transition-colors"
            >
              1 Day
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset(3)}
              className="px-3 py-1.5 rounded-lg border border-slate-line bg-ink-3 hover:border-gold/50 text-xs font-medium text-bone transition-colors"
            >
              3 Days
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset(7)}
              className="px-3 py-1.5 rounded-lg border border-slate-line bg-ink-3 hover:border-gold/50 text-xs font-medium text-bone transition-colors"
            >
              1 Week
            </button>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
          {/* Pickup Date */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pickupDate" className="text-xs font-mono font-medium text-ash flex items-center justify-between">
              <span>Pickup Date (AD)</span>
              {evaluation.pickupBsFormatted && (
                <span className="text-gold font-normal">{evaluation.pickupBsFormatted}</span>
              )}
            </label>
            <input
              id="pickupDate"
              data-testid="pickup-date-input"
              type="date"
              value={schedule.pickupDate}
              onChange={(e) => setSchedule((s) => ({ ...s, pickupDate: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-line bg-ink-3 text-bone font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>

          {/* Pickup Time */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pickupTime" className="text-xs font-mono font-medium text-ash">
              Pickup Time (NPT)
            </label>
            <select
              id="pickupTime"
              data-testid="pickup-time-input"
              value={schedule.pickupTime}
              onChange={(e) => setSchedule((s) => ({ ...s, pickupTime: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-line bg-ink-3 text-bone font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="06:00">06:00 AM (Day Start)</option>
              <option value="07:00">07:00 AM (Counter Opens)</option>
              <option value="09:00">09:00 AM (Standard)</option>
              <option value="12:00">12:00 PM (Noon)</option>
              <option value="15:00">03:00 PM</option>
              <option value="18:00">06:00 PM</option>
            </select>
          </div>

          {/* Return Date */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="returnDate" className="text-xs font-mono font-medium text-ash flex items-center justify-between">
              <span>Return Date (AD)</span>
              {evaluation.returnBsFormatted && (
                <span className="text-gold font-normal">{evaluation.returnBsFormatted}</span>
              )}
            </label>
            <input
              id="returnDate"
              data-testid="return-date-input"
              type="date"
              value={schedule.returnDate}
              onChange={(e) => setSchedule((s) => ({ ...s, returnDate: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-line bg-ink-3 text-bone font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>

          {/* Return Time */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="returnTime" className="text-xs font-mono font-medium text-ash">
              Return Time (NPT)
            </label>
            <select
              id="returnTime"
              data-testid="return-time-input"
              value={schedule.returnTime}
              onChange={(e) => setSchedule((s) => ({ ...s, returnTime: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-line bg-ink-3 text-bone font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="06:00">06:00 AM (Day Rollover)</option>
              <option value="09:00">09:00 AM</option>
              <option value="12:00">12:00 PM</option>
              <option value="18:00">06:00 PM (Counter Closes)</option>
              <option value="21:00">09:00 PM</option>
            </select>
          </div>
        </div>

        {/* Schedule Feedback Banner */}
        <div className="mt-6 pt-4 border-t border-slate-line/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {evaluation.validationError ? (
            <div data-testid="schedule-error-message" className="text-sm text-red-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              {evaluation.validationError}
            </div>
          ) : evaluation.isFullySelected ? (
            <div data-testid="schedule-confirmed-banner" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-bone">
              <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Schedule Active:
              </span>
              <span className="font-semibold text-gold font-mono">
                {evaluation.rentalDays} {evaluation.rentalDays === 1 ? 'Rental Day' : 'Rental Days'}
              </span>
              <span className="text-ash/60">·</span>
              <span className="text-ash text-xs">
                BS: {evaluation.pickupBsFormatted} → {evaluation.returnBsFormatted}
              </span>
            </div>
          ) : (
            <div data-testid="schedule-locked-notice" className="text-sm text-ash/80 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400/80" />
              Pick both pickup and return date &amp; time above to check live availability &amp; stock.
            </div>
          )}

          <div className="text-xs text-ash/60 font-mono">
            Timezone: Asia/Kathmandu (UTC+05:45)
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-8">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-gold text-ink font-semibold shadow-md'
                  : 'bg-ink-3 text-ash hover:text-bone hover:bg-slate-line/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full lg:w-72">
          <input
            type="search"
            placeholder="Search gear, brand, lens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-full border border-slate-line bg-ink-3 text-bone text-sm placeholder:text-ash/50 focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>
      </div>

      {/* Gear Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {filteredItems.map((item) => {
          const avail = getCatalogueItemAvailability(item, evaluation)

          return (
            <article
              key={item.id}
              data-testid={`catalogue-card-${item.id}`}
              className="group relative flex flex-col justify-between rounded-3xl border border-slate-line bg-ink-2/80 hover:border-gold/40 transition-all duration-300 overflow-hidden shadow-lg"
            >
              {/* Image & Header */}
              <div>
                <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-ink-3">
                  <div
                    className="absolute inset-0 bg-cover bg-center grayscale opacity-75 group-hover:scale-105 group-hover:grayscale-0 transition-all duration-500"
                    style={{
                      backgroundImage: `url(https://picsum.photos/seed/${item.seed}/800/600)`,
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-2 via-transparent to-transparent" />

                  {/* Brand & Category Tags */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-ink/80 backdrop-blur-md border border-white/10 text-[11px] font-mono font-medium text-gold uppercase tracking-wider">
                      {item.brand}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-ink/80 backdrop-blur-md border border-white/10 text-[11px] font-mono text-ash">
                      {item.category}
                    </span>
                  </div>

                  {/* Availability Badge (Strictly Gated) */}
                  <div className="absolute top-4 right-4">
                    {avail === null ? (
                      <span
                        data-testid="availability-locked-badge"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink/90 backdrop-blur-md border border-slate-line text-xs font-mono text-ash/80"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Select dates
                      </span>
                    ) : avail.isAvailable ? (
                      <span
                        data-testid="availability-unlocked-badge"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/90 backdrop-blur-md border border-emerald-500/40 text-xs font-mono text-emerald-300 font-semibold"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Available ({avail.bookableCount} free)
                      </span>
                    ) : (
                      <span
                        data-testid="availability-booked-badge"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/90 backdrop-blur-md border border-red-500/40 text-xs font-mono text-red-300 font-semibold"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        Booked out
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="font-display text-xl font-bold tracking-tight text-bone group-hover:text-gold transition-colors">
                    {item.name}
                  </h3>
                  <p className="mt-2 text-sm text-ash line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>

                  {/* Highlights */}
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {item.features.slice(0, 3).map((feat) => (
                      <li
                        key={feat}
                        className="text-[11px] font-mono px-2 py-0.5 rounded bg-ink-3/80 border border-slate-line/60 text-ash/80"
                      >
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Price & Action Footer */}
              <div className="p-6 pt-0 mt-4 border-t border-slate-line/50 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-xs text-ash/60">Rate per rental day</div>
                  <div className="font-display text-lg font-bold text-bone">
                    Rs {formatMoney(item.dailyRatePaisa)}
                    <span className="text-xs font-normal text-ash/70 ml-1">+ VAT</span>
                  </div>
                </div>

                {avail && avail.isAvailable ? (
                  <a
                    href="#contact"
                    className="px-4 py-2 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold uppercase tracking-wider transition-all transform hover:scale-105"
                  >
                    Request Kit
                  </a>
                ) : (
                  <a
                    href="#contact"
                    className="px-4 py-2 rounded-full border border-slate-line bg-ink-3 text-ash hover:text-bone text-xs font-medium transition-colors"
                  >
                    Inquire
                  </a>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
