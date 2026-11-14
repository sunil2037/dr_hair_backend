import { config } from '../../../config/env.js';
import { ServiceUnavailableError } from '../../../shared/errors/index.js';

const unavailableImageVerification = (label, details = 'The image verification service did not return a result.') => ({
  is_hair: false,
  status: 'verificationUnavailable',
  confidence: 0,
  detected_angle: label,
  follicle_visibility: 'Unknown',
  message: 'Photo verification is temporarily unavailable. Please retry.',
  details,
  source: 'unavailable',
});

const conservativeNextStepRecommendation = (patientData = {}) => {
  const pattern = String(patientData.hair_fall_pattern || '').toLowerCase();
  const symptoms = [patientData.scalp_symptoms, patientData.scalp_condition]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .join(' ')
    .toLowerCase();
  const advancedStage = /stage\s*[- ]?\s*[45]/i.test(String(patientData.hair_loss_stage || ''));
  const increasing = /yes|increasing|rapid|sudden/i.test(String(patientData.hair_fall_increasing || ''));
  const medicalHistory = (Array.isArray(patientData.medical_conditions)
    ? patientData.medical_conditions
    : [patientData.medical_conditions]).join(' ').toLowerCase();
  const redFlag = advancedStage || increasing || /patchy|sudden|rapid|rapidly/i.test(pattern) ||
    /pain|burn|sore|bleed|wound|pus|infection|swelling/i.test(symptoms) ||
    /thyroid|pcos|autoimmune|anemia|anaemia|pregnan|diabetes|kidney|renal|liver disease|cancer|chemotherapy/i.test(medicalHistory);

  return redFlag
    ? {
        type: 'doctor_appointment',
        reason: 'Your reported pattern or scalp symptoms deserve an in-person clinician review.',
      }
    : {
        type: 'products',
        reason: 'Your answers support starting with a simple daily care routine and optional product guidance.',
      };
};

export class GeminiAiService {
  constructor({ apiKey, model, fallbackModel, logger, fetchFn = globalThis.fetch, imageStorage } = {}) {
    this.apiKey = apiKey !== undefined ? apiKey : config.gemini?.apiKey;
    this.model = model !== undefined ? model : (config.gemini?.model || 'gemini-3.5-flash-lite');
    this.fallbackModel = fallbackModel !== undefined
      ? fallbackModel
      : (config.gemini?.fallbackModel || 'gemini-3.5-flash');
    this.logger = logger || console;
    this.fetchFn = fetchFn;
    this.imageStorage = imageStorage;
  }

  getConservativeNextStepRecommendation(patientData = {}) {
    return conservativeNextStepRecommendation(patientData);
  }

  async streamAssistantReply({ messages, onToken, signal } = {}) {
    if (!this.apiKey) {
      throw new ServiceUnavailableError('AI chat is not configured yet. Please try again later.');
    }
    if (typeof onToken !== 'function') {
      throw new TypeError('A token callback is required for streamed AI replies.');
    }

    const model = this.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(55000)])
      : AbortSignal.timeout(55000);
    let response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                'You are Dr. Hair Assistant, a friendly general hair and scalp wellness guide.',
                'Give clear, concise, practical information, and reply in the language the user used most recently.',
                'Use the user conversation only; do not claim access to medical records.',
                'You are not a doctor. Do not diagnose conditions, prescribe medicines, recommend medication doses, or tell users to stop prescribed treatment.',
                'For sudden or patchy hair loss, severe pain, bleeding, sores, pus, rapidly worsening symptoms, pregnancy, or complex medical history, advise contacting a qualified clinician promptly.',
                'For a medical emergency, tell the user to seek local emergency care. Do not promise outcomes or present product sales as medical treatment.',
                'If asked something outside hair, scalp, or general wellness, politely say you can help with hair and scalp questions.',
              ].join(' '),
            }],
          },
          contents: messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 700,
          },
        }),
        signal: requestSignal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.warn?.('Gemini assistant stream could not be reached.');
      throw new ServiceUnavailableError('The assistant is temporarily unavailable. Please try again.');
    }

    if (!response.ok || !response.body) {
      this.logger.warn?.(`Gemini assistant stream returned status ${response.status}.`);
      throw new ServiceUnavailableError('The assistant is temporarily unavailable. Please try again.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let outputLength = 0;
    const consumeLine = async (line) => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      const token = event?.candidates?.[0]?.content?.parts
        ?.map((part) => typeof part?.text === 'string' ? part.text : '')
        .join('') || '';
      if (!token) return;
      const safeToken = token.slice(0, Math.max(0, 12000 - outputLength));
      if (!safeToken) return;
      outputLength += safeToken.length;
      await onToken(safeToken);
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) await consumeLine(line);
        if (done) break;
        if (outputLength >= 12000) break;
      }
      if (buffer) await consumeLine(buffer);
    } finally {
      if (signal?.aborted) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  /**
   * Generates a comprehensive clinical assessment for a hair test using Google Gemini Flash.
   * If Gemini call fails or API key is not configured, falls back to clinical rule-based analysis.
   * @param {Object} patientData - Answers collected from the hair assessment questionnaire.
   * @returns {Promise<Object>} Formatted clinical assessment report.
   */
  async generateHairTestAssessment(patientData = {}) {
    if (!this.apiKey) {
      this.logger.warn?.('Gemini API key is not set; using clinical rules fallback.');
      return this.generateFallbackAssessment(patientData);
    }

    const prompt = this._buildPrompt(patientData);
    const inlineImages = Array.isArray(patientData.inlineImages)
      ? patientData.inlineImages.filter((image) => image?.data && image?.mimeType).slice(0, 2)
      : [];

    if (inlineImages.length === 0 && this.imageStorage?.downloadAuthenticatedImage) {
      const photos = Array.isArray(patientData.scalp_photos) ? patientData.scalp_photos : [];
      for (const photo of photos) {
        if (inlineImages.length >= 2) break;
        if (photo?.delivery_type !== 'authenticated' || !photo.file_name || !photo.format) continue;
        try {
          const image = await this.imageStorage.downloadAuthenticatedImage(photo.file_name, photo.format);
          if (image?.data && image?.mimeType) inlineImages.push(image);
        } catch {
          this.logger.warn?.('A private assessment image could not be loaded for AI analysis.');
        }
      }
    }

    const callGeminiOnce = async (model) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const parts = [{ text: prompt }];
        for (const img of inlineImages) {
          parts.push({
            inline_data: {
              mime_type: img.mimeType,
              data: img.data,
            },
          });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts,
              },
            ],
            generationConfig: {
              temperature: 0.2,
              topK: 40,
              topP: 0.9,
              maxOutputTokens: 2500,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          return { ok: false, status: response.status, errorText };
        }

        const jsonResponse = await response.json();
        const candidateText = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
        return { ok: true, candidateText };
      } catch (err) {
        clearTimeout(timeoutId);
        return { ok: false, status: 0, errorText: err.message };
      }
    };

    try {
      const callWithTransientRetry = async (model) => {
        let result = await callGeminiOnce(model);
        if (!result.ok && (result.status === 429 || result.status === 503)) {
          this.logger.warn?.(`Gemini [${result.status}] transient issue. Retrying once after 1500ms...`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          result = await callGeminiOnce(model);
        }
        return result;
      };

      let activeModel = this.model;
      let callResult = await callWithTransientRetry(activeModel);

      if (!callResult.ok && callResult.status === 404 && this.fallbackModel && this.fallbackModel !== this.model) {
        this.logger.warn?.(`Gemini model ${this.model} was unavailable; trying configured fallback model.`);
        activeModel = this.fallbackModel;
        callResult = await callWithTransientRetry(activeModel);
      }

      if (!callResult.ok) {
        this.logger.error?.(`Gemini API request failed with status ${callResult.status}.`);
        return this.generateFallbackAssessment(patientData);
      }

      if (!callResult.candidateText) {
        this.logger.warn?.('Gemini returned empty candidate text. Using fallback.');
        return this.generateFallbackAssessment(patientData);
      }

      const parsedData = this._parseJsonCandidate(callResult.candidateText);
      if (!parsedData || typeof parsedData !== 'object') {
        this.logger.warn?.(`Failed to parse valid JSON from Gemini output. Raw text length: ${callResult.candidateText?.length}. Preview: ${callResult.candidateText?.substring(0, 200)}`);
        return this.generateFallbackAssessment(patientData);
      }

      const hasRequiredAssessment =
        typeof parsedData.scalp_health_score === 'number' &&
        Number.isInteger(parsedData.scalp_health_score) &&
        parsedData.scalp_health_score >= 10 &&
        parsedData.scalp_health_score <= 100 &&
        String(parsedData.stage_classification || '').trim().length > 0 &&
        String(parsedData.summary || '').trim().length > 0 &&
        parsedData.recommended_regimen &&
        Array.isArray(parsedData.recommended_regimen.daily_steps);
      if (!hasRequiredAssessment) return this.generateFallbackAssessment(patientData);

      const nextStepRecommendation = (() => {
        const safetyRecommendation = conservativeNextStepRecommendation(patientData);
        const modelRecommendation = parsedData.next_step_recommendation;
        if (safetyRecommendation.type === 'doctor_appointment') return safetyRecommendation;
        if (modelRecommendation?.type === 'doctor_appointment') {
          return {
            type: 'doctor_appointment',
            reason: 'Your answers need a clinician review before the Assistant can suggest a care plan.',
          };
        }
        return safetyRecommendation;
      })();
      const isClinicianPriority = nextStepRecommendation.type === 'doctor_appointment';
      const recommendedRegimen = isClinicianPriority
        ? { summary: '', daily_steps: [], target_products: [] }
        : {
            ...parsedData.recommended_regimen,
            daily_steps: parsedData.recommended_regimen.daily_steps.filter((step) => {
              const instruction = String(step?.action || step?.instruction || step?.step || '');
              return !/\b(tablet|supplement|medicine|medication|prescription|dosage|mg|ml|minoxidil|capsule)\b/i.test(instruction);
            }),
          };

      return {
        ai_status: isClinicianPriority ? 'clinician_review_required' : 'available',
        scalp_health_score: isClinicianPriority ? null : (Number(parsedData.scalp_health_score) || 70),
        stage_classification: isClinicianPriority ? '' : String(parsedData.stage_classification || 'Stage 2 - Early Thinning'),
        summary: isClinicianPriority
          ? 'Please contact the clinic for guidance. The Assistant will not suggest a care plan for this assessment.'
          : String(parsedData.summary || 'Clinical AI evaluation completed based on reported symptoms.'),
        root_causes: isClinicianPriority ? [] : (Array.isArray(parsedData.root_causes) ? parsedData.root_causes : []),
        diet_plan: isClinicianPriority ? {} : (parsedData.diet_plan || {}),
        lifestyle_guidance: isClinicianPriority ? {} : (parsedData.lifestyle_guidance || {}),
        recommended_regimen: recommendedRegimen,
        next_step_recommendation: nextStepRecommendation,
        generated_by: `Dr. Hair Assistant (${activeModel})`,
        generated_at: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error?.(`Error invoking Gemini API: ${err.message}. Using fallback assessment.`);
      return this.generateFallbackAssessment(patientData);
    }
  }

  async generatePersonalizedDietPlan(patientData = {}) {
    if (!this.apiKey) throw new Error('AI meal planning service is unavailable.');
    const prompt = `You are Dr. Hair Assistant. You only answer hair, scalp, recovery, and related nutrition questions. Create a practical, culturally flexible 7-day food plan that may support general hair health. This is nutrition guidance, not treatment or diagnosis. Do not prescribe supplements, medicines, doses, or restrictive diets. Respect the patient's stated diet, allergies, medical conditions, current medicines, and relevant clinician care plans. Do not promise hair regrowth or invent patient details. If the available clinical context indicates a risk requiring clinician review, do not generate a meal plan and direct the patient to their clinician. Return only JSON with this shape: {"summary":"...","days":[{"day":"Day 1","meals":[{"type":"Breakfast","name":"...","ingredients":["..."],"benefit":"..."}]}],"safety_note":"..."}. Include 3 meals per day for 7 days. Keep meals realistic and use alternatives where allergy or dietary details require it.\nPatient health context: ${JSON.stringify({ age: patientData.age, gender: patientData.gender, diet_type: patientData.diet_type, protein_intake: patientData.protein_intake, allergy_status: patientData.allergy_status, allergy_details: patientData.allergy_details, medical_conditions: patientData.medical_conditions, current_medications: patientData.current_medications, gut_health: patientData.gut_health, foods_to_eat: patientData.ai_assessment?.diet_plan?.foods_to_eat, clinical_context: patientData.clinical_context })}`;
    const response = await this.fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2200, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) throw new Error(`AI meal plan request failed (${response.status}).`);
    const data = await response.json();
    const parsed = this._parseJsonCandidate(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.days) || parsed.days.length !== 7) {
      throw new Error('AI meal plan response was incomplete.');
    }
    const days = parsed.days.slice(0, 7).map((day, index) => ({
      day: String(day.day || `Day ${index + 1}`).slice(0, 30),
      meals: (Array.isArray(day.meals) ? day.meals : []).slice(0, 3).map((meal) => ({
        type: String(meal.type || '').slice(0, 40),
        name: String(meal.name || '').slice(0, 160),
        ingredients: (Array.isArray(meal.ingredients) ? meal.ingredients : []).slice(0, 8).map((item) => String(item).slice(0, 120)),
        benefit: String(meal.benefit || '').slice(0, 300),
      })),
    }));
    if (days.some((day) => day.meals.length !== 3 || day.meals.some((meal) => !meal.name))) {
      throw new Error('AI meal plan response was incomplete.');
    }
    const declaredAllergies = String(patientData.allergy_details || '').toLowerCase();
    const foodAllergenGroups = [
      ['peanut', 'groundnut'],
      ['tree nut', 'nuts', 'almond', 'cashew', 'walnut', 'pistachio'],
      ['milk', 'dairy', 'lactose'],
      ['egg'], ['fish'], ['shellfish', 'prawn', 'shrimp'],
      ['soy', 'soya'], ['wheat', 'gluten'], ['sesame'], ['mustard'],
    ];
    const mealText = JSON.stringify(days);
    const conflictingAllergen = foodAllergenGroups.find((group) => {
      const declared = group.some((allergen) => declaredAllergies.includes(allergen));
      return declared && group.some((alias) => new RegExp(`\\b${alias.replace(' ', '\\s+')}s?\\b`, 'i').test(mealText));
    });
    if (conflictingAllergen) throw new Error('AI meal plan included a declared food allergen.');
    return {
      summary: parsed.summary.slice(0, 500),
      days,
      safety_note: String(parsed.safety_note || 'This meal plan is general nutrition guidance and does not replace advice from your clinician.').slice(0, 500),
      generated_by: 'Dr. Hair Assistant',
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Builds the clinical trichology system & user prompt for Gemini.
   */
  _buildPrompt(patientData) {
    const age = patientData.age || 'Not specified';
    const gender = patientData.gender || 'Not specified';
    const duration = patientData.duration || patientData.hair_fall_start || 'Not specified';
    const pattern = patientData.hair_fall_pattern || 'Diffuse thinning';
    const dailyFall = patientData.daily_hair_fall || '50-100 hairs';
    const dandruff = patientData.dandruff || 'None';
    const scalpCondition = patientData.scalp_condition || 'Normal';
    const symptoms = Array.isArray(patientData.scalp_symptoms) ? patientData.scalp_symptoms.join(', ') : (patientData.scalp_symptoms || 'None');
    const stress = patientData.stress_level || 'Moderate';
    const gut = patientData.gut_health || 'Good';
    const sleep = patientData.sleep_quality || 'Fair';
    const diet = patientData.diet_type || 'Vegetarian';
    const protein = patientData.protein_intake || 'Moderate';
    const family = patientData.family_history || 'No reported family history';
    const medical = Array.isArray(patientData.medical_conditions) ? patientData.medical_conditions.join(', ') : (patientData.medical_conditions || 'None');
    const allergy = patientData.allergy_details || patientData.allergy_status || 'No known allergies';
    const meds = patientData.current_medications || patientData.current_medications_status || 'None';
    const increasing = patientData.hair_fall_increasing || 'Not specified';

    return `
You are "Dr. Hair Assistant", the Clinical AI Trichologist for Dr. Hair Clinic (guided by Dr. Jai Bansal's hair recovery protocols).
Analyze the following patient's hair assessment questionnaire and return a cautious, non-diagnostic screening summary with practical recommendations.

PATIENT PROFILE & ASSESSMENT RESPONSES:
- Age: ${age}
- Gender: ${gender}
- Hair Loss Duration: ${duration}
- Hair Fall Pattern: ${pattern}
- Hair Fall Increasing: ${increasing}
- Estimated Daily Hair Fall: ${dailyFall}
- Scalp Condition: ${scalpCondition}
- Dandruff Level: ${dandruff}
- Scalp Symptoms: ${symptoms}
- Stress Level: ${stress}
- Gut Health / Digestion: ${gut}
- Sleep Quality: ${sleep}
- Diet Type: ${diet}
- Protein Intake: ${protein}
- Family History of Baldness: ${family}
- Pre-existing Medical Conditions: ${medical}
- Known Allergies: ${allergy}
- Current Medications: ${meds}

Image handling: If photos are included, use them only to assess whether they appear to show the scalp and are clear enough for clinician review. Do not diagnose a condition or infer a hair-loss stage from photos. Base appointment recommendations on the patient's reported answers.

CLINICAL REQUIREMENTS:
Return a single strictly valid JSON object matching this schema exactly:
{
  "scalp_health_score": <Integer between 10 and 100; a questionnaire screening indicator, not a medical measurement>,
  "stage_classification": "<A cautious description of the patient's reported pattern; do not assign a medical diagnosis or infer a Norwood/Ludwig stage>",
  "summary": "<2-3 sentence cautious overview of the answers; distinguish reported information from possible explanations>",
  "next_step_recommendation": {
    "type": "doctor_appointment | products",
    "reason": "<Brief reason based only on the patient's answers; never present this as a diagnosis>"
  },
  "root_causes": [
    {
      "factor": "<e.g., DHT Sensitivity & Miniaturization, Scalp Microbiome & Sebum, Nutritional Deficit, Stress & Cortisol>",
      "severity": "<Low | Moderate | High>",
      "explanation": "<Specific reason explaining how this factor impacts this specific patient's follicles>"
    }
  ],
  "diet_plan": {
    "summary": "<1-2 sentence dietary strategy tailored to their diet type and protein level>",
    "foods_to_eat": ["<Item 1 with hair benefit>", "<Item 2>", "<Item 3>", "<Item 4>"],
    "foods_to_avoid": ["<Item 1 with reason>", "<Item 2>", "<Item 3>"],
    "hydration_target": "<Daily water intake recommendation in Litres>",
    "key_nutrients": ["<Nutrient 1 (e.g. Biotin)>", "<Nutrient 2 (e.g. Zinc)>", "<Nutrient 3>", "<Nutrient 4>"]
  },
  "lifestyle_guidance": {
    "summary": "<1-2 sentence lifestyle and routine optimization strategy>",
    "scalp_care_tips": ["<Tip 1>", "<Tip 2>", "<Tip 3>"],
    "oiling_rules": ["<Rule 1 regarding oiling frequency & dandruff management>", "<Rule 2>"],
    "sleep_and_stress": ["<Practical action 1>", "<Practical action 2>"]
  },
  "recommended_regimen": {
    "summary": "<Practical daily care plan based on the reported answers; do not describe it as a complete medical treatment>",
    "daily_steps": [
      {
        "step": "Morning",
        "instruction": "<Simple non-prescription self-care habit; do not prescribe medicine, supplements, or product dosage>"
      },
      {
        "step": "Afternoon",
        "instruction": "<Simple nutrition or wellbeing habit; do not prescribe medicine, supplements, or product dosage>"
      },
      {
        "step": "Night",
        "instruction": "<Simple non-prescription self-care habit; do not prescribe medicine, supplements, or product dosage>"
      }
    ],
    "target_products": [
      {
        "name": "<Use the same broad label as category; do not invent a brand or catalog item>",
        "category": "<Choose one: Hair Care, Serums, or Supplements>",
        "reason": "<Optional reason for considering this category; keep it non-medical>"
      },
      {
        "name": "<Broad category label>",
        "category": "<Choose one: Hair Care, Serums, or Supplements>",
        "reason": "<Optional reason>"
      }
    ]
  }
}

NEXT-STEP DECISION:
- Use type "doctor_appointment" when the answers report patchy hair loss, sudden or rapidly increasing shedding, scalp pain/burning/sores/bleeding, advanced reported thinning, or symptoms whose cause needs clinical assessment. State the reason in calm, non-alarmist language.
- Otherwise use the existing type "products" to mean a self-care pathway with practical daily steps; products are optional supporting choices, never the primary treatment or the only next step.
- Make the next step fit the patient's reported condition and realistic care options. When clinician assessment is needed, prioritize the appointment/review path. Do not imply that AI guidance or catalog items provide a complete treatment.
- Suggest only broad categories from Hair Care or Serums; never suggest supplements, medicines, prescriptions, or branded products. The app matches broad categories to the active in-stock catalog.
- Never infer a diagnosis from a photo or questionnaire, and never recommend prescription treatment or supplement dosing.
- Do not call the score a clinical measurement or present the reported pattern as a confirmed stage or diagnosis.

Do not include markdown fences outside the JSON. Return valid JSON only.
`;
  }

  /**
   * Robust JSON extractor and parser.
   */
  _parseJsonCandidate(text) {
    if (!text) return null;
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Returns an explicit unavailable result when AI cannot produce a usable assessment.
   */
  generateFallbackAssessment(patientData = {}) {
    const safetyRecommendation = conservativeNextStepRecommendation(patientData);
    return {
      ai_status: 'unavailable',
      scalp_health_score: null,
      stage_classification: null,
      summary: 'AI could not prepare your assessment right now. Please try again later or discuss your answers with a clinician.',
      root_causes: [],
      diet_plan: {},
      lifestyle_guidance: {},
      recommended_regimen: {
        summary: '',
        daily_steps: [],
        target_products: [],
      },
      next_step_recommendation: safetyRecommendation.type === 'doctor_appointment'
        ? safetyRecommendation
        : {
            type: 'unavailable',
            reason: 'AI could not prepare a product recommendation. Please retry or ask a clinician.',
          },
      generated_by: 'unavailable',
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Visually detects whether an uploaded photo is a genuine human scalp/hair image
   * using Gemini Flash vision.
   * @param {Object} options
   * @param {Buffer} [options.imageBuffer] - Raw file buffer
   * @param {string} [options.base64Data] - Or raw base64 string
   * @param {string} [options.mimeType] - Mime type e.g. 'image/jpeg' or 'image/png'
   * @param {string} [options.label] - Intended angle e.g. 'Front Hairline', 'Crown / Top'
   * @returns {Promise<Object>} Detection result
   */
  async detectHairAndScalpImage({ imageBuffer, base64Data, mimeType = 'image/jpeg', label = 'Scalp' } = {}) {
    let data = base64Data;
    if (!data && imageBuffer) {
      data = imageBuffer.toString('base64');
    }

    if (!data || !this.apiKey) {
      return unavailableImageVerification(label, 'Image data or AI service configuration is unavailable.');
    }

    const prompt = `
You are Dr. Hair Assistant's Clinical Vision AI (under Dr. Jai Bansal's hair recovery protocols).
Perform strict clinical triage for an uploaded patient photo intended for trichology scalp evaluation.
Target angle: "${label}".

CRITICAL CLINICAL ACCEPTANCE RULES:
1. ONLY APPROVE (status: "hairDetected", is_hair: true) if this photo clearly shows a REAL HUMAN SCALP, HAIRLINE, CROWN, TEMPLES, or ROOTS suitable for a trichology doctor to evaluate hair loss and follicle density.
2. YOU MUST REJECT (status: "notHair", is_hair: false):
   - Screenshots of any kind (phone UI, WhatsApp chats, social media, web pages, apps, text, documents, billing receipts, etc.).
   - Photos of computer monitors, laptop displays, or digital screens.
   - Random non-hair objects (cars, roads, animals, food, clothes, furniture, rooms, buildings, landscape, plants, nature, etc.).
   - Full body or distant portraits where scalp/hairline roots are not in clear close-up view.
   - Non-head body parts (hands, fingers, legs, chest, face without scalp).
   - Memes, artwork, drawings, cartoons, or graphic illustrations.
3. If image has hair/scalp but is extremely dark, blurry, or obstructed so a trichologist cannot evaluate hair density: mark status: "lowClarity", is_hair: false.

Return strictly valid JSON:
{
  "is_hair": true,
  "status": "hairDetected",
  "confidence": 0.95,
  "detected_angle": "${label}",
  "follicle_visibility": "Clear",
  "message": "Clear scalp and hair follicles verified for clinical assessment.",
  "details": "Follicular density and scalp pattern clearly visible."
}

If rejected (non-hair, screenshot, or random object), return:
{
  "is_hair": false,
  "status": "notHair",
  "confidence": 0.98,
  "detected_angle": "Unknown",
  "follicle_visibility": "None",
  "message": "Non-scalp image detected. Please upload an exclusive close-up photo of your scalp.",
  "details": "Screenshots, digital graphics, or non-scalp objects cannot be used for clinical diagnosis."
}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            topK: 20,
            topP: 0.9,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return unavailableImageVerification(label);
      }

      const jsonResponse = await response.json();
      const candidateText = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = this._parseJsonCandidate(candidateText);

      if (!parsed || typeof parsed !== 'object') {
        return unavailableImageVerification(label);
      }

      const allowedStatuses = new Set(['hairDetected', 'notHair', 'lowClarity']);
      if (!allowedStatuses.has(parsed.status)) return unavailableImageVerification(label);
      if (parsed.status === 'hairDetected' && parsed.is_hair !== true) {
        return unavailableImageVerification(label);
      }
      const isHair = parsed.status === 'hairDetected';
      const status = parsed.status;

      return {
        is_hair: isHair,
        status,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.92,
        detected_angle: parsed.detected_angle || label,
        follicle_visibility: parsed.follicle_visibility || 'Clear',
        message: parsed.message || (parsed.is_hair ? 'Hair & scalp detected successfully.' : 'No hair or scalp detected. Please upload a clear photo of your scalp.'),
        details: parsed.details || '',
        source: `Dr. Hair Assistant (${this.model})`,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      return unavailableImageVerification(label);
    }
  }
}
