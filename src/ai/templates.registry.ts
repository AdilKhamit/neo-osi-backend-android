// src/ai/templates.registry.ts

// 👇 1. Определяем интерфейс, чтобы TypeScript не ругался
export interface TemplateConfig {
    name: string;
    language: 'ru' | 'kz';
    category?: string; // Поле категории (необязательное, но мы его заполним)
    tags_in_template: (string | { loopName: string, loopTags: string[] })[];
}

// 👇 2. Сам реестр с категориями
export const TEMPLATES_REGISTRY: Record<string, TemplateConfig> = {
    // --- KZ: РЕМОНТ ---
    'agymdagy-zhondeu-zhurgizu-protsesinde-kalyptastyrilg-an-tekhnikalyk-zhane-oryndaushylyk-kuzhattamany-kabyldau-tapsyru-aktisinin-nysany.docx': {
        name: 'Ағымдағы жөндеу жүргізу процесінде қалыптастырылған техникалық және орындаушылық құжаттаманы қабылдау-тапсыру актісінің нысаны',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'act_address', 'sender_fio', 'sender_position', 'receiver_fio', 'receiver_position',
            { loopName: 'docs', loopTags: ['index', 'name', 'notes'] },
            'receiver_date', 'sender_date'
        ],
        language: 'kz'
    },

    // --- RU: ФИНАНСЫ / РЕМОНТ ---
    'forma-akta-podtverzhdayushchego-fakt-изменения-zakazchikom-obema-periodichnosti-vypolneniya-rabot-ili-ikh-stoimosti-tseny.docx': {
        name: 'Форма акта, подтверждающего факт изменения заказчиком объема, периодичности выполнения работ или их стоимости (цены)',
        category: 'Финансы и отчеты',
        tags_in_template: [
            'change_description', 'property_address', 'decision_body', 'customer_details', 'performer_details',
            { loopName: 'work_items', loopTags: ['index', 'work_name', 'standard_cost', 'cost_calculation_schedule', 'change_justification', 'new_work_cost', 'new_schedule_cost'] },
            'change_consequences', 'performer_date', 'customer_date'
        ],
        language: 'ru'
    },

    // --- RU: РЕМОНТ (Капитальный) ---
    'forma-akta-priyema-peredachi-tekhnicheskoy-dokumentatsii-dlya-provedeniya-kapitalnogo-remonta-imushchestva.docx': {
        name: 'Форма акта приема-передачи технической документации для проведения капитального ремонта имущества',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'property_address', 'transferring_party_details', 'accepting_party_details',
            { loopName: 'documents', loopTags: ['doc_index', 'doc_name', 'doc_quantity', 'doc_notes'] },
            'accepting_party_date', 'transferring_party_date'
        ],
        language: 'ru'
    },

    // --- RU: РЕМОНТ (Текущий) ---
    'forma-akta-priyema-peredachi-tekhnicheskoy-dokumentatsii-dlya-provedeniya-tekushchego-remonta-imushchestva.docx': {
        name: 'Форма акта приёма-передачи технической документации для проведения текущего ремонта имущества',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'property_address', 'customer_details', 'contractor_details',
            { loopName: 'documents', loopTags: ['doc_index', 'doc_name', 'doc_notes'] },
            'accepting_party_date', 'transferring_party_date'
        ],
        language: 'ru'
    },

    // --- RU: УПРАВЛЕНИЕ (Передача дома) ---
    'forma-akta-priyema-peredachi-tekhnicheskoy-i-inoy-dokumentatsii-na-mnogokvartirnyy-zhilyy-dom.docx': {
        name: 'Форма акта приема-передачи технической и иной документации на многоквартирный жилой дом',
        category: 'Управление ОСИ',
        tags_in_template: [
            'property_address', 'transferor_details', 'acceptor_details',
            { loopName: 'documents', loopTags: ['doc_index', 'doc_name', 'doc_sheet_count', 'doc_notes'] },
            'acceptor_date', 'transferor_date'
        ],
        language: 'ru'
    },

    // --- RU: РЕМОНТ (Исполнительная документация) ---
    'forma-akta-priyema-peredachi-tekhnicheskoy-i-ispolnitelnoy-dokumentatsii-sformirovannoy-v-protsesse-provedeniya-kapitalnogo-remonta.docx': {
        name: 'Форма акта приема-передачи технической и исполнительной документации, сформированной в процессе проведения капитального ремонта',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'property_address', 'technical_customer_details', 'managing_entity_details',
            { loopName: 'documents', loopTags: ['doc_index', 'doc_name', 'doc_sheet_count', 'doc_notes'] },
            'acceptor_date', 'transferor_date'
        ],
        language: 'ru'
    },
    'forma-akta-priyema-peredachi-tekhnicheskoy-i-ispolnitelnoy-dokumentatsii-sformirovannoy-v-protsesse-provedeniya-tekushchego-remonta.docx': {
        name: 'Форма акта приёма-передачи технической и исполнительной документации, сформированной в процессе проведения текущего ремонта',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'property_address', 'customer_details', 'contractor_details',
            { loopName: 'documents', loopTags: ['doc_index', 'doc_name', 'doc_notes'] },
            'acceptor_date', 'transferor_date'
        ],
        language: 'ru'
    },

    // --- RU: РЕМОНТ (Сдача-приемка работ) ---
    'forma-akta-sdachi-priyemki-rabot-vypolnennykh-v-protsesse-kapitalnogo-remonta-imushchestva.docx': {
        name: 'Форма акта сдачи-приемки работ, выполненных в процессе капитального ремонта имущества',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'approval_date', 'approval_protocol_num', 'act_address', 'act_date', 'commission_assigner', 'order_date', 'chairman_details', 'commission_member_organizations', 'contractor_rep_details', 'construction_control_rep_details', 'design_org_rep_details', 'managing_entity_rep_details', 'local_authority_rep_details', 'repaired_property_address', 'capital_repair_type', 'psd_developer', 'psd_approval_details',
            { loopName: 'contractors', loopTags: ['contractor_and_works'] },
            'inspection_date', 'inspection_organization', 'scheduled_start_date', 'actual_start_date', 'scheduled_end_date', 'actual_end_date', 'docs_assessment', 'architectural_solutions_summary', 'defects_appendix_num', 'estimated_cost', 'actual_cost', 'quality_assessment_grade', 'final_project_indicators_summary', 'energy_efficiency_class', 'sustainability_rating', 'post_repair_condition_summary', 'decision_property_location', 'main_appendix_num', 'act_number', 'final_protocol_copy_address', 'final_protocol_date', 'final_protocol_num', 'chairman_signature_fio',
            { loopName: 'commission_signatures', loopTags: ['member_signature_fio'] }
        ],
        language: 'ru'
    },
    'forma-akta-sdachi-priyemki-rabot-vypolnennykh-v-protsesse-tekushchego-remonta-imushchestva.docx': {
        name: 'Форма акта сдачи-приемки работ, выполненных в процессе текущего ремонта имущества',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'approval_date', 'approval_protocol_num', 'act_address', 'act_date', 'commission_assigner', 'order_date', 'chairman_details', 'commission_member_organizations', 'contractor_rep_details', 'construction_control_rep_details', 'design_org_rep_details', 'performer_rep_details', 'local_authority_rep_details', 'repaired_property_address', 'psd_developer', 'psd_approval_details', 'contractor_and_works', 'inspection_date', 'inspection_organization', 'scheduled_start_date', 'actual_start_date', 'scheduled_end_date', 'actual_end_date', 'docs_assessment', 'architectural_solutions_summary', 'defects_deadline_date', 'defects_appendix_num', 'estimated_cost', 'actual_cost', 'quality_assessment_grade', 'final_project_indicators_summary', 'energy_efficiency_class', 'sustainability_rating', 'post_repair_condition_summary', 'decision_property_location', 'main_appendix_num', 'act_number', 'final_protocol_copy_address', 'final_protocol_date', 'chairman_signature_fio',
            { loopName: 'commission_signatures', loopTags: ['member_signature_fio'] }
        ],
        language: 'ru'
    },

    // --- RU: ОСМОТРЫ (Техническое состояние) ---
    'forma-otcheta-zaklyucheniya-po-itogam-instrumentalnogo-osmotra-mnogokvartirnogo-zhilogo-doma.docx': {
        name: 'Форма отчета (заключения) по итогам инструментального осмотра многоквартирного жилого дома',
        category: 'Ремонт и стройка',
        tags_in_template: ['organization_name', 'organization_credentials', 'property_address', 'technical_assignment', 'inspection_type', 'inspection_period', 'inspectors_and_qualifications', 'design_organization', 'construction_organization', 'year_of_construction', 'last_major_repair_details', 'operating_instructions_requirements', 'building_structural_type', 'inspection_regulations', 'inspection_tools_and_equipment', 'executed_works_list', 'identified_deviations_and_changes', 'deformations_and_damages_classification', 'quality_and_condition_assessment', 'obtained_parameters', 'overall_condition_assessment', 'urgent_safety_issues', 'physical_wear_and_tear_details', 'recommended_works_for_restoration', 'changes_to_operating_instructions', 'current_technical_condition_category', 'technical_documentation_compiled'],
        language: 'ru'
    },

    // --- KZ: ОСМОТРЫ ---
    'kop-paterli-turgyn-uidi-instrumenttik-tekseru-korytyndylary-boiynsha-esep-teme-korytyndy-formasy.docx': {
        name: 'Көп пәтерлі тұрғын үйді инструменттік тексеру қорытындылары бойынша есептеме (қорытынды) формасы',
        category: 'Ремонт и стройка',
        tags_in_template: ['organization_name', 'organization_credentials', 'property_address', 'technical_assignment', 'inspection_type', 'inspection_period', 'inspectors_and_qualifications', 'design_organization', 'construction_organization', 'year_of_construction', 'last_major_repair_details', 'operating_instructions_requirements', 'building_structural_type', 'inspection_regulations', 'inspection_tools_and_equipment', 'executed_works_list', 'identified_deviations_and_changes', 'deformations_and_damages_classification', 'quality_and_condition_assessment', 'obtained_parameters', 'overall_condition_assessment', 'urgent_safety_issues', 'physical_wear_and_tear_details', 'recommended_works_for_restoration', 'changes_to_operating_instructions', 'current_technical_condition_category', 'technical_documentation_compiled'],
        language: 'kz'
    },

    // --- KZ: РЕМОНТ (Документация) ---
    'mulikke-agymdagy-zhondeudi-zhurgizuge-arnalgan-tekhnikalyk-kuzhattamany-kabyldau-tapsyru-aktisinin-nysany.docx': {
        name: 'Мүлікке ағымдағы жөндеуді жүргізуге арналған техникалық құжаттаманың қабылдау-тапсыру актісінің нысаны',
        category: 'Ремонт и стройка',
        tags_in_template: [
            'address', 'sender_fio', 'sender_position', 'receiver_fio', 'receiver_position',
            { loopName: 'docs', loopTags: ['index', 'name', 'notes'] },
            'receiver_date', 'sender_date'
        ],
        language: 'kz'
    },
    'mulikti-agymdagy-zhondeu-protsesinde-oryndalgan-tapsyru-kabyldau-zhumystary-aktisinin-nysany.docx': {
        name: 'Мүлікті ағымдағы жөндеу процесінде орындалған тапсыру-қабылдау жұмыстары актісінің нысаны',
        category: 'Ремонт и стройка',
        tags_in_template: ['approval_date', 'approval_protocol_number', 'act_address', 'act_date', 'commission_order_details', 'commission_order_date', 'chairman_fio', 'chairman_position', 'commission_members_list', 'contractor_fio', 'contractor_position', 'tech_supervision_fio', 'tech_supervision_position', 'design_org_fio', 'design_org_position', 'performer_fio', 'performer_position', 'local_gov_fio', 'local_gov_position', 'presented_property_address', 'design_estimate_developer', 'design_estimate_approver', 'design_estimate_protocol_num', 'design_estimate_approval_date', 'repair_contractor_details', 'instrumental_check_date', 'instrumental_check_org', 'scheduled_start_date', 'actual_start_date', 'scheduled_end_date', 'actual_end_date', 'submitted_docs_description', 'architectural_solutions_description', 'defects_appendix_number', 'defects_deadline', 'estimated_works_cost', 'actual_works_cost', 'quality_grade', 'final_repair_parameters', 'energy_efficiency_class', 'sustainability_rating', 'post_repair_condition_summary', 'property_for_acceptance_address', 'final_act_creation_date', 'final_appendix_number', 'final_owners_meeting_address', 'final_meeting_date', 'final_meeting_protocol_num', 'chairman_signature_fio',
            { loopName: 'commission_members', loopTags: ['member_fio'] },
        ],
        language: 'kz'
    },

    // --- KZ: ФИНАНСЫ ---
    'tapsyrys-berushinin-zhumystardy-oryndau-kolemin-kezeildigin-nemese-olardyn-kunyn-bagasyn-ozgertu-faktisin-rastaityn-akt-nysany.docx': {
        name: 'Тапсырыс берушінің жұмыстарды орындау көлемін, кезеңділігін немесе олардың құнын (бағасын) өзгерту фактісін растайтын акт нысаны',
        category: 'Финансы и отчеты',
        tags_in_template: [
            'change_description', 'property_address', 'decision_making_body', 'customer_rep_fio', 'customer_rep_position', 'performer_rep_fio', 'performer_rep_position',
            { loopName: 'work_items', loopTags: ['index', 'work_name', 'standard_cost', 'cost_calculation_schedule', 'change_justification', 'new_work_cost', 'new_schedule_cost'] },
            'change_consequences', 'performer_date', 'customer_date'
        ],
        language: 'kz'
    }
};
