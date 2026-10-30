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
    this.date = date;
  }

  toResponse() {
    return {
      id: this.id,
      treatment_name: this.treatment_name,
      duration: this.duration,
      instructions: this.instructions,
      doctor_name: this.doctor_name,
      date: this.date,
    };
  }
}

