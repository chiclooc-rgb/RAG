
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const columns = [
        'filesize', 'size',
        'uploadedat', 'uploaded_at',
        'createdat', 'created_at',
        'geminifilename', 'gemini_file_name', 'geminifile_name',
        'mimetype', 'mime_type'
    ];

    for (const col of columns) {
        const { error } = await supabase
            .from('files')
            .select(col)
            .limit(1);

        if (error) {
            console.log(`❌ Column '${col}' DOES NOT exist`);
        } else {
            console.log(`✅ Column '${col}' exists`);
        }
    }
}

checkColumns();
