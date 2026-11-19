import React from 'react'

interface CategoryNavProps {
  categories: string[]
  activeCategory: string
  onSelectCategory: (cat: string) => void
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <nav className="category-nav" role="navigation" aria-label="Equipment categories">
      <button
        type="button"
        className={`category-tab ${activeCategory === 'All' ? 'active' : ''}`}
        onClick={() => onSelectCategory('All')}
        aria-pressed={activeCategory === 'All'}
      >
        All Equipment
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
          onClick={() => onSelectCategory(cat)}
          aria-pressed={activeCategory === cat}
        >
          {cat}
        </button>
      ))}
    </nav>
  )
}
