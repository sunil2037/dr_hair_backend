/**
 * Hair Test Domain Entity
 */
export class HairTest {
  constructor({
    id,
    userId,
    reference_no,
    created_at = new Date().toISOString(),
    // Personal Info
    full_name,
    email,
    phone,
    age,
    gender,
    city,
    occupation,
    // Hair & Scalp
    hair_fall_start,
    hair_fall_pattern,
    daily_hair_fall,
    hair_fall_increasing,
    dandruff,
    scalp_condition,
    scalp_symptoms = [],
    hair_type,
    // Lifestyle & Medical
    medical_conditions = [],
    recent_events = [],
    stress_level,
    sleep_quality,
    diet_type,
    protein_intake,
    // Treatment History & Goals
    family_history,
    have_taken_treatment,
    previous_treatments = [],
    treatment_results,
    main_concern,
    looking_for,
    hair_loss_stage,
    // Scalp Photos
    scalp_photos = [],
  }) {
    this.id = id;
    this.userId = userId;
    this.reference_no = reference_no;
    this.created_at = created_at;
    this.full_name = full_name;
    this.email = email;
    this.phone = phone;
    this.age = age;
    this.gender = gender;
    this.city = city;
    this.occupation = occupation;
    this.hair_fall_start = hair_fall_start;
    this.hair_fall_pattern = hair_fall_pattern;
    this.daily_hair_fall = daily_hair_fall;
    this.hair_fall_increasing = hair_fall_increasing;
    this.dandruff = dandruff;
    this.scalp_condition = scalp_condition;
    this.scalp_symptoms = scalp_symptoms;
    this.hair_type = hair_type;
    this.medical_conditions = medical_conditions;
    this.recent_events = recent_events;
    this.stress_level = stress_level;
    this.sleep_quality = sleep_quality;
    this.diet_type = diet_type;
    this.protein_intake = protein_intake;
    this.family_history = family_history;
    this.have_taken_treatment = have_taken_treatment;
    this.previous_treatments = previous_treatments;
    this.treatment_results = treatment_results;
    this.main_concern = main_concern;
    this.looking_for = looking_for;
    this.hair_loss_stage = hair_loss_stage;
    this.scalp_photos = scalp_photos;
  }

  toSummary() {
    return {
      id: this.id,
      reference_no: this.reference_no,
      created_at: this.created_at,
      hair_loss_stage: this.hair_loss_stage,
      scalp_photos: this.scalp_photos,
    };
  }
}

