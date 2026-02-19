-- Seed assistant_sources with curated excerpts
-- Uses the first firm in the database (single-tenant seed)

DO $$
DECLARE
  v_firm_id uuid;
BEGIN
  SELECT id INTO v_firm_id FROM firms LIMIT 1;

  IF v_firm_id IS NULL THEN
    RAISE EXCEPTION 'No firm found. Create a firm first.';
  END IF;

  -- External: LSAG 2025 s. 5.13
  INSERT INTO assistant_sources (firm_id, source_type, source_name, section_ref, topics, content, effective_date)
  VALUES (
    v_firm_id,
    'external',
    'LSAG Sectoral Guidance 2025',
    's. 5.13',
    ARRAY['risk-assessment', 'cmlra', 'scoring', 'methodology'],
    E'Risk Assessment Methodology\n\n5.13 Firms must undertake a documented risk assessment for each client matter. The risk assessment should:\n\n(a) Consider the risk factors relevant to the client and matter;\n\n(b) Apply a consistent methodology to score or categorise risk;\n\n(c) Document the rationale for the risk rating assigned;\n\n(d) Be proportionate to the nature and size of the firm''s business;\n\n(e) Be reviewed and updated periodically, and when there is a material change in circumstances.\n\nThe risk assessment should result in a clear determination of whether the matter presents low, medium, or high risk. Firms should ensure that the methodology used is applied consistently across all matters.',
    '2025-01-01'
  );

  -- External: MLR 2017 reg. 28
  INSERT INTO assistant_sources (firm_id, source_type, source_name, section_ref, topics, content, effective_date)
  VALUES (
    v_firm_id,
    'external',
    'Money Laundering Regulations 2017',
    'reg. 28',
    ARRAY['cdd', 'verification', 'identity', 'due-diligence'],
    E'Customer due diligence measures\n\n28.\u2014(1) The customer due diligence measures which a relevant person must apply under regulation 27 are\u2014\n\n(a) identifying the customer unless the identity of that customer is known to, and has been verified by, the relevant person;\n\n(b) verifying the customer''s identity unless the customer''s identity has already been verified by the relevant person;\n\n(c) assessing, and where appropriate obtaining information on, the purpose and intended nature of the business relationship or occasional transaction.\n\n(2) A relevant person must identify the customer by requiring the customer to provide\u2014\n(a) the customer''s full name; and\n(b) at least one of the following\u2014\n(i) the customer''s date of birth;\n(ii) the customer''s place of birth;\n(iii) the customer''s nationality.\n\n(3) Where the customer is an individual, the relevant person must also, in the course of identifying the customer, require the customer to provide the customer''s residential address.',
    '2017-06-26'
  );

  -- External: MLR 2017 reg. 33
  INSERT INTO assistant_sources (firm_id, source_type, source_name, section_ref, topics, content, effective_date)
  VALUES (
    v_firm_id,
    'external',
    'Money Laundering Regulations 2017',
    'reg. 33',
    ARRAY['edd', 'enhanced-due-diligence', 'high-risk', 'pep'],
    E'Enhanced customer due diligence: required assessment\n\n33.\u2014(1) A relevant person must apply enhanced customer due diligence measures and enhanced ongoing monitoring, in addition to the customer due diligence measures required under regulation 28(2) to (10), to manage and mitigate the risks arising\u2014\n\n(a) in any case identified as one where there is a high risk of money laundering or terrorist financing\u2014\n(i) by the relevant person under regulation 18(1), or\n(ii) in information made available to the relevant person under regulations 17(9) and 47;\n\n(b) in relation to a business relationship or transaction with a person established in a high-risk third country or in relation to any relevant transaction where either of the parties to the transaction is established in a high-risk third country.\n\n(2) Enhanced customer due diligence measures taken by a relevant person for the purposes of paragraph (1) must include\u2014\n(a) obtaining additional information on the customer and on the customer''s beneficial owner;\n(b) obtaining additional information on the intended nature of the business relationship;\n(c) obtaining information on the source of funds and source of wealth of the customer and of the customer''s beneficial owner;\n(d) obtaining information on the reasons for the intended or performed transactions;\n(e) obtaining the approval of senior management for establishing or continuing the business relationship;\n(f) conducting enhanced monitoring of the business relationship.',
    '2017-06-26'
  );

  -- Internal: Eventus PCPs s. 4.6
  INSERT INTO assistant_sources (firm_id, source_type, source_name, section_ref, topics, content, effective_date)
  VALUES (
    v_firm_id,
    'internal',
    'Eventus AML PCPs',
    's. 4.6',
    ARRAY['risk-scoring', 'thresholds', 'cmlra', 'methodology'],
    E'Risk Scoring Thresholds\n\n4.6 Eventus applies the following risk scoring thresholds to all Client and Matter Level Risk Assessments (CMLRAs):\n\n- LOW RISK: Total score of 0 to 4 points\n- MEDIUM RISK: Total score of 5 to 8 points\n- HIGH RISK: Total score of 9 or more points\n\nThese thresholds have been calibrated based on Eventus'' Practice-Wide Risk Assessment and are reviewed annually. The MLRO may adjust scoring or override thresholds in exceptional circumstances, with documented justification.\n\nAll risk scores must be calculated using the approved Internal Risk Scoring Model (currently version 3.7). Manual adjustments to scores are not permitted without MLRO approval.',
    '2024-12-18'
  );

  -- Internal: Eventus PCPs s. 8
  INSERT INTO assistant_sources (firm_id, source_type, source_name, section_ref, topics, content, effective_date)
  VALUES (
    v_firm_id,
    'internal',
    'Eventus AML PCPs',
    's. 8',
    ARRAY['sof', 'source-of-funds', 'third-party', 'verification'],
    E'Source of Funds Requirements\n\n8.1 Source of Funds (SoF) documentation is required for all matters rated MEDIUM or HIGH risk.\n\n8.2 SoF documentation must identify and verify the origin of funds being used for a specific transaction or matter. This includes:\n\n(a) The immediate source of funds (e.g., bank account, mortgage provider);\n(b) How the client obtained those funds;\n(c) Supporting documentary evidence.\n\n8.3 Third-Party Funding\n\nWhere funds are being provided by a third party (i.e., not the client), additional scrutiny is required:\n\n(a) The third party must be identified and their relationship to the client documented;\n(b) The source of the third party''s funds must be established;\n(c) The rationale for third-party funding must be understood and documented;\n(d) This automatically adds 2 points to the risk score under the Internal Risk Scoring Model.\n\n8.4 Cross-Border Funds\n\nWhere funds originate from outside the UK, fee earners must:\n\n(a) Identify the jurisdiction of origin;\n(b) Consider any sanctions or HRTC implications;\n(c) Obtain supporting bank documentation;\n(d) This adds 1 point to the risk score.',
    '2024-12-18'
  );

  RAISE NOTICE 'Inserted 5 assistant source excerpts for firm %', v_firm_id;
END $$;
