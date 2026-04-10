import { PiiStripperService } from '../pii-stripper.service';

describe('PiiStripperService', () => {
  const service = new PiiStripperService();

  describe('AZ phone numbers', () => {
    it('should strip +994 format', () => {
      const result = service.strip('Nömrəm +994 50 123 45 67');
      expect(result.cleaned).toContain('[TELEFON]');
      expect(result.cleaned).not.toContain('+994');
      expect(result.strippedCount).toBe(1);
    });

    it('should strip 050 format', () => {
      const result = service.strip('Zəng et 050 123 45 67');
      expect(result.cleaned).toContain('[TELEFON]');
      expect(result.cleaned).not.toContain('050');
    });

    it('should strip 055 format', () => {
      const result = service.strip('055-234-56-78 nömrəsinə yaz');
      expect(result.cleaned).toContain('[TELEFON]');
    });

    it('should strip 070 format', () => {
      const result = service.strip('070 345 67 89');
      expect(result.cleaned).toBe('[TELEFON]');
    });

    it('should strip 077 format', () => {
      const result = service.strip('0772345678');
      expect(result.cleaned).toContain('[TELEFON]');
    });

    it('should strip multiple phone numbers', () => {
      const result = service.strip('050 111 22 33 və 055 444 55 66');
      expect(result.strippedCount).toBeGreaterThanOrEqual(2);
    });

    it('should not strip non-phone numbers', () => {
      const result = service.strip('Mən 25 yaşındayam');
      expect(result.strippedCount).toBe(0);
      expect(result.cleaned).toBe('Mən 25 yaşındayam');
    });
  });

  describe('email addresses', () => {
    it('should strip email', () => {
      const result = service.strip('Emailim test@gmail.com');
      expect(result.cleaned).toContain('[EMAİL]');
      expect(result.cleaned).not.toContain('test@gmail.com');
    });

    it('should strip complex email', () => {
      const result = service.strip('user.name+tag@company.co.uk');
      expect(result.cleaned).toContain('[EMAİL]');
    });
  });

  describe('FIN codes', () => {
    it('should strip FIN with prefix', () => {
      const result = service.strip('FIN: 1A2B3C4');
      expect(result.cleaned).toContain('[FIN]');
    });

    it('should strip FIN in context', () => {
      const result = service.strip('Fin kodum 5X6Y7Z8');
      expect(result.cleaned).toContain('[FIN]');
    });
  });

  describe('ID cards', () => {
    it('should strip AZE ID number', () => {
      const result = service.strip('Şəxsiyyətim AZE12345678');
      expect(result.cleaned).toContain('[ŞƏXSİYYƏT_NO]');
    });
  });

  describe('credit card numbers', () => {
    it('should strip 16-digit card number', () => {
      const result = service.strip('Kartım 4169 7388 1234 5678');
      expect(result.cleaned).toContain('[KART]');
    });
  });

  describe('mixed content', () => {
    it('should strip multiple PII types in one message', () => {
      const text = 'Adım Əli, nömrəm 050 111 22 33, emailim ali@mail.az';
      const result = service.strip(text);
      expect(result.cleaned).toContain('Adım Əli');
      expect(result.cleaned).toContain('[TELEFON]');
      expect(result.cleaned).toContain('[EMAİL]');
      expect(result.strippedCount).toBeGreaterThanOrEqual(2);
    });

    it('should preserve non-PII text exactly', () => {
      const text = 'Mən stressdən əziyyət çəkirəm, kömək lazımdır';
      const result = service.strip(text);
      expect(result.cleaned).toBe(text);
      expect(result.strippedCount).toBe(0);
    });
  });

  describe('containsPii', () => {
    it('should return true for text with phone', () => {
      expect(service.containsPii('050 123 45 67')).toBe(true);
    });

    it('should return false for clean text', () => {
      expect(service.containsPii('Salam, necəsən?')).toBe(false);
    });
  });
});
