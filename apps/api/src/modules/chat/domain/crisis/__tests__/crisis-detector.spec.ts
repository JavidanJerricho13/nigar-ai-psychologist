import { CrisisDetectorService, CRISIS_SAFETY_MESSAGE } from '../crisis-detector.service';

describe('CrisisDetectorService', () => {
  const service = new CrisisDetectorService();

  describe('containsCrisisKeywords', () => {
    // Azerbaijani keywords
    it('should detect "intihar"', () => {
      expect(service.containsCrisisKeywords('Mən intihar haqqında düşünürəm')).toBe(true);
    });

    it('should detect "özümü öldür"', () => {
      expect(service.containsCrisisKeywords('Özümü öldürmək istəyirəm')).toBe(true);
    });

    it('should detect "yaşamaq istəmirəm"', () => {
      expect(service.containsCrisisKeywords('Daha yaşamaq istəmirəm')).toBe(true);
    });

    it('should detect "özümə zərər"', () => {
      expect(service.containsCrisisKeywords('Özümə zərər vurmaq istəyirəm')).toBe(true);
    });

    // Russian keywords
    it('should detect Russian "самоубийство"', () => {
      expect(service.containsCrisisKeywords('Думаю о самоубийство')).toBe(true);
    });

    it('should detect Russian "не хочу жить"', () => {
      expect(service.containsCrisisKeywords('Я не хочу жить')).toBe(true);
    });

    // English keywords
    it('should detect English "suicide"', () => {
      expect(service.containsCrisisKeywords('I am thinking about suicide')).toBe(true);
    });

    it('should detect English "kill myself"', () => {
      expect(service.containsCrisisKeywords('I want to kill myself')).toBe(true);
    });

    // Negative cases
    it('should NOT detect normal messages', () => {
      expect(service.containsCrisisKeywords('Salam, necəsən?')).toBe(false);
    });

    it('should NOT detect stress without crisis', () => {
      expect(service.containsCrisisKeywords('Mən çox stressliyəm')).toBe(false);
    });

    it('should NOT detect sadness without crisis', () => {
      expect(service.containsCrisisKeywords('Bu gün çox kədərliyəm')).toBe(false);
    });

    it('should be case-insensitive for ASCII', () => {
      expect(service.containsCrisisKeywords('INTIHAR')).toBe(true);
      expect(service.containsCrisisKeywords('Intihar')).toBe(true);
    });
  });

  describe('getMatchedKeywords', () => {
    it('should return all matched keywords', () => {
      const matches = service.getMatchedKeywords('Intihar haqqında düşünürəm, ölmək istəyirəm');
      expect(matches).toContain('intihar');
      expect(matches).toContain('ölmək istəyirəm');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty for safe message', () => {
      expect(service.getMatchedKeywords('Yaxşıyam, sağ ol')).toEqual([]);
    });
  });

  describe('buildSafetyResponse', () => {
    it('should append safety message to LLM response', () => {
      const response = service.buildSafetyResponse('Mən səni başa düşürəm.');
      expect(response).toContain('Mən səni başa düşürəm.');
      expect(response).toContain('860-510-510');
      expect(response).toContain('116-111');
      expect(response).toContain('tək deyilsən');
    });

    it('should include the full safety message constant', () => {
      const response = service.buildSafetyResponse('');
      expect(response).toContain(CRISIS_SAFETY_MESSAGE);
    });
  });
});
