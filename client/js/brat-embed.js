// use brat to render dependencies

// Load Brat libraries
var bratLocation = './lib/brat@7a58bbe';

var webFontURLs = [
  bratLocation + '/static/fonts/Astloch-Bold.ttf',
  bratLocation + '/static/fonts/PT_Sans-Caption-Web-Regular.ttf',
  bratLocation + '/static/fonts/Liberation_Sans-Regular.ttf'
];

head.js(
  // External libraries
  bratLocation + '/client/lib/jquery.min.js',
  bratLocation + '/client/lib/jquery.svg.min.js',
  bratLocation + '/client/lib/jquery.svgdom.min.js',

  // brat helper modules
  bratLocation + '/client/src/configuration.js',
  bratLocation + '/client/src/util.js',
  bratLocation + '/client/src/annotation_log.js',
  bratLocation + '/client/lib/webfont.js',

  // brat modules
  bratLocation + '/client/src/dispatcher.js',
  bratLocation + '/client/src/url_monitor.js',
  bratLocation + '/client/src/visualizer.js'
);



// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

/**
 * A mapping from part of speech tag to the associated
 * visualization color
 */
function labelColor(label) {
  if (label.startsWith('N')) {
    return '#A4BCED';
  } else if (label.startsWith('V') || label.startsWith('M')) {
    return '#ADF6A2';
  } else if (label.startsWith('P')) {
    return '#CCDAF6';
  } else if (label.startsWith('I')) {
    return '#FFE8BE';
  } else if (label.startsWith('R') || label.startsWith('W')) {
    return '#FFFDA8';
  } else if (label.startsWith('D') || label == 'CD') {
    return '#CCADF6';
  } else if (label.startsWith('J')) {
    return '#FFFDA8';
  } else if (label.startsWith('T')) {
    return '#FFE8BE';
  } else if (label.startsWith('E') || label.startsWith('S')) {
    return '#E4CBF6';
  } else if (label.startsWith('CC')) {
    return '#FFFFFF';
  } else if (label == 'LS' || label == 'FW') {
    return '#FFFFFF';
  } else {
    return '#E3E3E3';
  }
}

/**
 * Generate an annotation id
 */
function id(i, typeid, subtypeid=0) {
  if(subtypeid)
    return `A${i}_T${typeid}_${subtypeid}`;
  return `A${i}_T${typeid}`;
}

/**
 * Generate a unique type vocabulary value
 */
function val(typeid, textvalue) {
  return `T${typeid}_${textvalue}`;
}

// ----------------------------------------------------------------------------
// Render sentence with brat
// ----------------------------------------------------------------------------

function render_sentence_brat(annotated_sentence_disassembled, embedelem, callback) {

  /**
   * Register an entity type (a tag) for Brat
   */
  const entity_types = { };
  function addEntityTypeValue(type, value) {
    const labeltypeval = val(type, value);
    // Don't add duplicates
    if (!entity_types[labeltypeval])
      entity_types[labeltypeval] = {
        type: labeltypeval,
        labels : [ value ],
        bgColor: type == 1 ? labelColor(value) : '#ffccaa',
        borderColor: 'darken'
      };
  }

  /**
   * Register a relation type (an arc) for Brat
   */
  const relation_types = { };
  function addRelationTypeValue(type, value, symmetricEdge=false) {
    const labeltypeval = val(type, value);
    // Prevent adding duplicates
    if (!relation_types[labeltypeval])
      relation_types[labeltypeval] = {
        type: labeltypeval,
        labels: [ value ],
        dashArray: (symmetricEdge ? '3,3' : undefined),
        arrowHead: (symmetricEdge ? 'none' : undefined),
      };
  }

  //
  // Shared variables
  // These are what we'll render in BRAT
  //
  // (annotations)
  const entities = [ ];
  // (relations)
  const relations = [ ];

  //
  // Process tokens and create the sentence
  //
  const s = annotated_sentence_disassembled; // keep it short
  const spacechar = ' ' // '\xa0' // ' '
  const sentence = s.tokens.map(token => token.text + Array(token.num_spaces_after).fill(spacechar).join('')).join('')
  
  /**
   * Process spans
   */
  // Format Spans: [${ID}, ${TEXT}, [[${BOFFSET}, ${EOFFSET}]]]
  s.spans.forEach(span => {
    if(span.text) {
      addEntityTypeValue(span.type, span.text);
      entities.push([
        id(span.i, span.type),
        val(span.type, span.text), 
        [ [ span.begin(s.tokens), span.end(s.tokens) ] ]
      ]);
    }
  })

  /**
   * Process relations / dependencies / arcs
   */
  // Format Relations:  [${ID}, ${TYPE}, [[${ARGNAME}, ${SOURCE}], [${ARGNAME}, ${TARGET}]]]
  s.relations.forEach(rel => {
    addRelationTypeValue(rel.type, rel.text);
    if(rel.text) {
      relations.push([
        id(rel.i, rel.type, rel.subtype),
        val(rel.type, rel.text), 
        [ 
          ['src', id(rel.headspani, rel.spantype)],
          ['dest', id(rel.spani, rel.spantype)]
        ]
      ]);
    }
  })

  const collData = { entity_types: Object.values(entity_types), relation_types: Object.values(relation_types) };
  const docData = { text: sentence, entities: entities, relations: relations };
  // prepare copies because the original objects will be modified during rendering by brat
  const collData_copy = JSON.parse(JSON.stringify(collData)); 
  const docData_copy = JSON.parse(JSON.stringify(docData));

  //
  // Now render the elements 
  // based on http://brat.nlplab.org/embed.html
  head.ready(function() {
    const brat_dispatcher = Util.embed(
      // id of the div element where brat should embed the visualisations
      embedelem,
      // object containing collection data
      collData,
      // object containing document data
      docData,
      // Array containing locations of the visualisation fonts
      webFontURLs
    );
    // callback when finished
    brat_dispatcher.on('doneRendering', function() { callback(brat_dispatcher, collData_copy, docData_copy); } );
  }); // end render
}  // End render function


// ----------------------------------------------------------------------------
// Render relations
// ----------------------------------------------------------------------------
function render_sentence(annotated_sentence, embedelem, callback) {
  // disassemble and render annotated sentence
  const disassembled = disassemble_annotated_sentence(annotated_sentence);
  render_sentence_brat(disassembled, embedelem, callback);    
}

function disassemble_annotated_sentence(annotated_sentence){

  const tokens = [ ];
  const spans = [ ];
  const relations = [ ];
  const types = { }; // keep a counter of the different types

  function add_annotated_token(annotated_token, addspace, begin, i){
    // word/label1/.../labeln/rel1:head1/.../reln:headn
    let fields = [];
    let tibegin = tiend = -1;
    let new_token_offset = 0;
    if(!annotated_token.startsWith('/')) { // we have a token in the beginning and span or relation annotations a possible further fields
      fields = annotated_token.split('/');
      token = { // add the token itself
        text: fields.shift(), // use and remove the first item from fields
        num_spaces_after: addspace.length,
        i: tokens.length,
        begin: begin,
        tlength: function() { return this.text.length; },
        length: function() { return this.tlength() + this.num_spaces_after; },
        tend: function() { return this.begin + this.tlength(); },
        end: function() { return this.begin + this.length(); }
      }
      tokens.push( token );
      tibegin = tiend = token.i;
      new_token_offset = token.end();
    } else { // otherwise we only have anntotation fields with the mutitoken span definition in the beginning
      // process multi token span annotations
      annotated_token = annotated_token.substring(1); // remove first '/' char and continue to extract span and relation annotations as ususal
      fields = annotated_token.split('/');
      // first field defines the token span in the form of 'begin-end' (end is inclusive) e.g. '1-1' for single tokens, '1-2' for tokens 1 and 2, '1-5' for tokens 1 to 5
      const token_span = fields.shift().split('-'); // first split is begin, second is end (inclusive)
      tibegin = parseInt(token_span[0])-1;
      tiend = parseInt(token_span[1])-1;
    }

    // walk through the remaining fields and convert them to the expected span or relation annotation
    let span = null;
    fields.forEach((field, k) => {
      const isrel = /^.*:\d*$/.test(field);
      if (!isrel) { // span annotation
        const spantype = k+1;
        types[spantype] = types[spantype] ? types[spantype]+1 : 1; // increase spantype counter
        span = {
          tibegin : tibegin,
          tiend : tiend,
          text : field.replace(/^_$/,'').replace(/_/g, ' '),
          type : spantype,
          i : i, 
          k : types[spantype],
          begin : function(tokenlist) { return tokenlist[this.tibegin].begin },
          end : function(tokenlist) { return tokenlist[this.tiend].tend() }
        }
        spans.push(span);
      } else if(span && isrel) { // matches a relation annotation where a span must have occurred before
        // * Relation targets will always be connected to the span that was added just before and to the defined span id at the same level as the span before
        const reltype = k+1;
        field.split(';').forEach((r, j) => {
          types[reltype] = types[reltype] ? types[reltype]+1 : 1; // increase relationtype counter
          const d = r.split(':');
          const head_span = parseInt(d[1]);
          const rel = {
            text : d[0].replace(/^_$/,'').replace(/_/g, ' '),
            type: reltype,
            subtype : j+1,
            i : i,
            k : types[reltype],
            headspani : isNaN(head_span) ? span.i : head_span,
            spani : span.i, // relations always connect to span annotations and not tokens themselves!
            spantype: span.type // the span type id that was added before
          };
          relations.push(rel);
        })
      }
    });
    return new_token_offset;
  }

  const regexp = RegExp('\\s+','g');
  let end_of_last_match = 0;
  let match;
  let tokenbegin = 0;
  let i = 0;
  // find spaces, add everything inbetween as a annotated token
  while ((match = regexp.exec(annotated_sentence + ' ' /* add space at the end to make sure last token will be found, this way we'll always find a match at the end*/)) !== null) {
     // console.log(`Found ${match[0]} start=${match.index} end=${regexp.lastIndex}.`);
    // console.log(`${annotated_sentence.substring(offset, match.index)}`);
    annotated_token = annotated_sentence.substring(end_of_last_match, match.index);
    const tokenend = add_annotated_token(annotated_token, match[0], tokenbegin, ++i);
    tokenbegin = tokenend;
    end_of_last_match = regexp.lastIndex;
  }

  const disassembled = {
      annotated : annotated_sentence,
      tokens : tokens,
      spans : spans,
      relations : relations,
      types : types,
  };

  return disassembled;
}
