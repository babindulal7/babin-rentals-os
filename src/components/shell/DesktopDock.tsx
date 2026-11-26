import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'
import { permittedNav, activeNavTo } from '../../data/nav'
import { useAuth } from '../../lib/auth'
import './shell.css'

/** RULING 2026-10-26: one desktop dock reuses the locked NAV and its role filters. */
export default function DesktopDock({ active }: { active: string }) {
  const { user } = useAuth()
  const links = permittedNav(user?.role)
  const activeTo = activeNavTo(links, active)
  const dock = useRef<HTMLElement>(null)

  useEffect(() => {
    dock.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({
      block: 'nearest', inline: 'nearest', behavior: 'auto',
    })
  }, [activeTo])

  if (links.length === 0) return null

  return (
    <div className="app-desktop-dock-slot">
      <nav ref={dock} className="app-desktop-dock" aria-label="Main">
        {links.map(section => {
          const selected = section.to === activeTo
          return (
            <Link
              key={section.to}
              to={section.to}
              className="app-desktop-dock__link"
              aria-current={selected ? 'page' : undefined}
            >
              <Icon name={section.icon} size={20} />
              <span>{section.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
