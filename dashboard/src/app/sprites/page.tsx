'use client';

import { CharacterSprite, CharacterClass } from '@/components/CharacterSprite';

const classes: CharacterClass[] = ['warrior', 'mage', 'rogue', 'archer'];

export default function SpritesDemo() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
      <h1 className="text-3xl font-bold mb-8 text-center">All Character Sprites</h1>

      <div className="flex justify-center gap-12 flex-wrap">
        {classes.map((cls) => (
          <div key={cls} className="text-center">
            <div className="w-32 h-32 bg-gray-700 rounded-lg border-2 border-purple-500 flex items-center justify-center mb-4">
              <CharacterSprite characterClass={cls} size={120} />
            </div>
            <p className="text-lg font-semibold capitalize">{cls}</p>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mt-16 mb-8 text-center">Size Comparison</h2>

      <div className="flex justify-center gap-8 items-end flex-wrap">
        {[32, 64, 96, 128, 192].map((size) => (
          <div key={size} className="text-center">
            <div
              className="bg-gray-700 rounded-lg border border-gray-600 flex items-center justify-center mb-2"
              style={{ width: size + 16, height: size + 16 }}
            >
              <CharacterSprite characterClass="warrior" size={size} />
            </div>
            <p className="text-sm text-gray-400">{size}px</p>
          </div>
        ))}
      </div>
    </main>
  );
}
