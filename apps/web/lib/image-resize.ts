/** Tipos de imagem aceitos para logos e avatares. */
export const BRAND_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_BRAND_IMAGE_INPUT = 8 * 1024 * 1024; // arquivo escolhido (antes de reduzir)

export function checkBrandImage(file: { type: string; size: number }): string | null {
  if (!(BRAND_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use uma imagem PNG, JPG ou WEBP.';
  if (file.size > MAX_BRAND_IMAGE_INPUT) return 'A imagem passa de 8 MB. Escolha um arquivo menor.';
  return null;
}

/**
 * Reduz a imagem para um quadrado no navegador antes de enviar: a imagem inteira cabe no quadrado
 * (logos largos não perdem as pontas), centralizada, com margem e fundo branco. Arquivo leve para o
 * chat carregar rápido no site do cliente.
 */
export async function squareImage(file: File, size = 256): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.');
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, size, size);
    // Imagem quase quadrada (foto): ocupa tudo. Logo largo ou alto: encaixa inteiro com margem.
    const ratio = image.naturalWidth / image.naturalHeight;
    const nearlySquare = ratio > 0.85 && ratio < 1.18;
    const box = nearlySquare ? size : size * 0.84;
    const scale = nearlySquare ? Math.max(box / image.naturalWidth, box / image.naturalHeight) : Math.min(box / image.naturalWidth, box / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    const type = 'image/webp';
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.9));
    if (!blob) throw new Error('Não foi possível preparar a imagem.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
