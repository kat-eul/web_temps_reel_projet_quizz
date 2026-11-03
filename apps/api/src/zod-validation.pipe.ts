import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/** Valide l'entrée avec un schéma Zod partagé ; le serveur ne fait jamais confiance au client. */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Données invalides',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
