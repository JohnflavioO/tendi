import { describe, expect, it } from 'vitest';
import { checkBrandImage } from './image-resize';

describe('imagem do chat (logo ou avatar)', () => {
  it('aceita PNG, JPG e WEBP até 8 MB', () => {
    expect(checkBrandImage({ type: 'image/png', size: 200_000 })).toBeNull();
    expect(checkBrandImage({ type: 'image/jpeg', size: 8 * 1024 * 1024 })).toBeNull();
    expect(checkBrandImage({ type: 'image/webp', size: 10 })).toBeNull();
  });

  it('recusa outros formatos e arquivos grandes', () => {
    expect(checkBrandImage({ type: 'image/gif', size: 10 })).toContain('PNG, JPG ou WEBP');
    expect(checkBrandImage({ type: 'image/svg+xml', size: 10 })).toContain('PNG, JPG ou WEBP');
    expect(checkBrandImage({ type: 'image/png', size: 9 * 1024 * 1024 })).toContain('8 MB');
  });
});
