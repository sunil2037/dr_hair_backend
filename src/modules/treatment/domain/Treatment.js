/**
 * Treatment Domain Entity
 */
export class Treatment {
  constructor({
    id,
    test_id,
    reference_no,
    userId,
    treatment_name,
    duration,
    instructions,
    doctor_name,
    medications = [],
    diagnosis = '',
    stage = '',
    next_review_date = '',
    routine_steps = [],
    diet_meals = [],
    date = new Date().toISOString().split('T')[0],
  }) {
    this.id = id;
    this.test_id = test_id;
    this.reference_no = reference_no;
    this.userId = userId;
    this.treatment_name = treatment_name;
    this.duration = duration;
    this.instructions = instructions;
    this.doctor_name = doctor_name;
    this.medications = medications;
    this.diagnosis = diagnosis;
    this.stage = stage;
    this.next_review_date = next_review_date;
    this.routine_steps = routine_steps;
    this.diet_meals = diet_meals;
    this.date = date;
  }

  toResponse() {
    return {
      id: this.id,
      treatment_name: this.treatment_name,
      duration: this.duration,
      instructions: this.instructions,
      doctor_name: this.doctor_name,
      medications: this.medications,
      diagnosis: this.diagnosis,
      stage: this.stage,
      next_review_date: this.next_review_date,
      routine_steps: this.routine_steps,
      diet_meals: this.diet_meals,
      date: this.date,
    };
  }
}

